package transcoder

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
	amqp "github.com/rabbitmq/amqp091-go"
	"golang.org/x/sync/errgroup"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"streamforge/internal/logger"
	"streamforge/internal/metadata"
	"streamforge/internal/models"
	"streamforge/internal/upload"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

var (
	activeJobsGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "transcoder_active_jobs",
		Help: "The total number of active transcoder jobs",
	})
	jobsCompletedTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "transcoder_jobs_completed_total",
		Help: "The total number of completed transcoder jobs",
	})
	jobsFailedTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "transcoder_jobs_failed_total",
		Help: "The total number of failed transcoder jobs",
	})
)

var (
	nvencCheckOnce   sync.Once
	isNvencSupported bool
)

// isHardwareNVENCSupported detects whether NVIDIA NVENC hardware acceleration is present
func isHardwareNVENCSupported() bool {
	nvencCheckOnce.Do(func() {
		cmd := exec.Command("ffmpeg", "-encoders")
		out, err := cmd.Output()
		if err == nil && strings.Contains(string(out), "h264_nvenc") {
			isNvencSupported = true
		}
	})
	return isNvencSupported
}

type Worker struct {
	DB   *gorm.DB
	S3   *upload.S3Service
	AMQP *amqp.Connection

	mu         sync.RWMutex
	activeJobs map[uint]string
	wg         sync.WaitGroup
}

func (w *Worker) Start() error {
	w.activeJobs = make(map[uint]string)

	ch, err := w.AMQP.Channel()
	if err != nil {
		return err
	}

	// Setup DLX
	if err := ch.ExchangeDeclare("transcode_dlx", "direct", true, false, false, false, nil); err != nil {
		return err
	}
	dlq, err := ch.QueueDeclare("transcode_dlq", true, false, false, false, nil)
	if err != nil {
		return err
	}
	if err := ch.QueueBind(dlq.Name, "", "transcode_dlx", false, nil); err != nil {
		return err
	}

	args := amqp.Table{"x-dead-letter-exchange": "transcode_dlx"}
	q, err := ch.QueueDeclare(
		"transcode_queue",
		true,
		false,
		false,
		false,
		args,
	)
	if err != nil {
		return err
	}

	// Set QoS to 1 so this worker only receives one job at a time
	if err := ch.Qos(1, 0, false); err != nil {
		return err
	}

	msgs, err := ch.Consume(
		q.Name,
		"",
		false, // manual ack
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	// 1. Graceful Shutdown (WaitGroups & OS Signals)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	go func() {
		<-ctx.Done()
		logger.Log.Info("Received shutdown signal. Stopping AMQP consumer and active jobs to gracefully shutdown...")
		ch.Close() // Breaks the range msgs loop
	}()

	// 2. Thread-Safe Job Tracking API (Mutex)
	go func() {
		http.HandleFunc("/health", func(rw http.ResponseWriter, r *http.Request) {
			w.mu.RLock()
			defer w.mu.RUnlock()
			rw.Header().Set("Content-Type", "application/json")
			json.NewEncoder(rw).Encode(map[string]interface{}{
				"status":      "healthy",
				"active_jobs": w.activeJobs,
			})
		})
		http.Handle("/metrics", promhttp.Handler())
		logger.Log.Info("Worker Health Server running on :8082")
		http.ListenAndServe(":8082", nil)
	}()

	logger.Log.Info("Transcoder Worker started. Waiting for jobs...")

	for d := range msgs {
		w.wg.Add(1)
		
		// Spawn a goroutine so the main loop can listen for ch.Close() (Graceful Shutdown)
		go func(delivery amqp.Delivery) {
			defer w.wg.Done()
			
			var job metadata.TranscodeJob
			if err := json.Unmarshal(delivery.Body, &job); err != nil {
				log.Printf("Failed to unmarshal job: %v\n", err)
				delivery.Nack(false, false)
				return
			}

			// Register job in Thread-Safe Map
			w.mu.Lock()
			w.activeJobs[job.VideoID] = "Starting"
			w.mu.Unlock()
			activeJobsGauge.Inc()

			defer func() {
				w.mu.Lock()
				delete(w.activeJobs, job.VideoID)
				w.mu.Unlock()
				activeJobsGauge.Dec()
			}()

			logger.Log.Info("Received transcode job", zap.Uint("video_id", job.VideoID))
			
			var retryCount int32 = 0
			if val, ok := delivery.Headers["x-retry-count"]; ok {
				if count, ok := val.(int32); ok {
					retryCount = count
				}
			}

			err := w.processJob(ctx, job)
			if err != nil {
				log.Printf("Failed to process job for Video %d: %v\n", job.VideoID, err)
				
				if retryCount < 3 {
					log.Printf("Retrying job for Video %d (Retry %d/3)\n", job.VideoID, retryCount+1)
					headers := delivery.Headers
					if headers == nil {
						headers = make(amqp.Table)
					}
					headers["x-retry-count"] = retryCount + 1
					
					// Requeue logic
					_ = ch.Publish(
						delivery.Exchange,
						delivery.RoutingKey,
						false,
						false,
						amqp.Publishing{
							Headers:      headers,
							ContentType:  delivery.ContentType,
							Body:         delivery.Body,
							DeliveryMode: amqp.Persistent,
						},
					)
					delivery.Ack(false)
				} else {
					logger.Log.Error("Max retries reached, sending to DLX", zap.Uint("video_id", job.VideoID))
					w.DB.Transaction(func(tx *gorm.DB) error {
						var video models.Video
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", job.VideoID).First(&video).Error; err != nil {
							return err
						}
						if video.Status == "Processing" {
							return tx.Model(&video).Update("status", "Failed").Error
						}
						return nil
					})
					delivery.Nack(false, false)
					jobsFailedTotal.Inc()
				}
			} else {
				logger.Log.Info("Successfully processed job", zap.Uint("video_id", job.VideoID))
				delivery.Ack(false)
				jobsCompletedTotal.Inc()
			}
		}(d)
	}

	logger.Log.Info("No longer accepting messages. Waiting for active jobs to finish...")
	w.wg.Wait()
	logger.Log.Info("Worker exited gracefully.")
	return nil
}

func (w *Worker) processJob(ctx context.Context, job metadata.TranscodeJob) error {
	prefix := fmt.Sprintf("hls/%d_%d", job.VideoID, time.Now().Unix())
	masterURL := fmt.Sprintf("s3://%s/%s/master.m3u8", w.S3.BucketName, prefix)

	err := w.DB.Transaction(func(tx *gorm.DB) error {
		var video models.Video
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", job.VideoID).First(&video).Error; err != nil {
			return err
		}
		
		if video.Status == "Live" || video.Status == "Uploaded" {
			return tx.Model(&video).Updates(map[string]interface{}{
				"status": "Processing",
				"url":    masterURL,
			}).Error
		}
		
		logger.Log.Info("Ignoring transcode start due to invalid state", zap.String("status", video.Status), zap.Uint("video_id", job.VideoID))
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to acquire processing lock: %w", err)
	}

	var objectKey string
	if job.Type != "Live" {
		if strings.HasPrefix(job.URL, "s3://") {
			parts := strings.SplitN(strings.TrimPrefix(job.URL, "s3://"), "/", 2)
			if len(parts) != 2 {
				return fmt.Errorf("invalid s3 URL: %s", job.URL)
			}
			objectKey = parts[1]
		} else {
			return fmt.Errorf("unsupported URL format for transcode: %s", job.URL)
		}
	}

	tempDir := fmt.Sprintf("/tmp/transcode/%d", job.VideoID)
	os.RemoveAll(tempDir)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return err
	}
	for _, dir := range []string{"1080p", "720p", "480p", "360p"} {
		os.MkdirAll(filepath.Join(tempDir, dir), 0755)
	}
	defer os.RemoveAll(tempDir)

	var inputPath string
	var durationSeconds int = 0
	var generatedThumbURL string

	if job.Type == "Live" {
		inputPath = strings.Replace(job.URL, "localhost", "mediamtx", 1)
	} else {
		inputPath = filepath.Join(tempDir, "input.mp4")
		logger.Log.Info("Downloading file from S3", zap.String("objectKey", objectKey))
		dlCtx, dlCancel := context.WithTimeout(ctx, 10*time.Minute)
		defer dlCancel()
		
		if err := w.S3.DownloadFile(dlCtx, objectKey, inputPath); err != nil {
			return err
		}

		// 1. Extract true video duration via ffprobe
		probeCmd := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath)
		if out, err := probeCmd.Output(); err == nil {
			rawDuration := strings.TrimSpace(string(out))
			if secFloat, err := strconv.ParseFloat(rawDuration, 64); err == nil {
				durationSeconds = int(secFloat)
				logger.Log.Info("Extracted video duration via ffprobe", zap.Uint("video_id", job.VideoID), zap.Int("duration_seconds", durationSeconds))
			}
		}

		// 2. Generate fallback poster thumbnail from frame at 3 seconds if needed
		var currentVideo models.Video
		if err := w.DB.Select("thumbnail_url", "user_id").First(&currentVideo, job.VideoID).Error; err == nil {
			needsThumb := currentVideo.ThumbnailURL == "" || strings.Contains(currentVideo.ThumbnailURL, "unsplash.com") || strings.Contains(currentVideo.ThumbnailURL, "default_")
			if needsThumb {
				seekTime := "00:00:03"
				if durationSeconds > 0 && durationSeconds < 3 {
					seekTime = "00:00:01"
				}
				autoThumbPath := filepath.Join(tempDir, "auto_thumb.jpg")
				thumbCmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-ss", seekTime, "-i", inputPath, "-vframes", "1", "-q:v", "2", autoThumbPath)
				if err := thumbCmd.Run(); err == nil {
					thumbKey := fmt.Sprintf("thumbnails/%d/%d_auto.jpg", currentVideo.UserID, job.VideoID)
					if err := w.S3.UploadFile(ctx, thumbKey, autoThumbPath); err == nil {
						generatedThumbURL = fmt.Sprintf("http://localhost:9000/%s/%s", w.S3.BucketName, thumbKey)
						logger.Log.Info("Generated auto-thumbnail from video frame", zap.Uint("video_id", job.VideoID), zap.String("url", generatedThumbURL))
					}
				}
			}
		}
	}

	// 3. Hardware-Aware Codec Selection
	encoder := "libx264"
	preset := "ultrafast"
	if isHardwareNVENCSupported() {
		encoder = "h264_nvenc"
		preset = "p4"
		logger.Log.Info("Hardware acceleration active: using h264_nvenc", zap.Uint("video_id", job.VideoID))
	} else {
		logger.Log.Info("Hardware acceleration unavailable: using CPU libx264", zap.Uint("video_id", job.VideoID))
	}

	// 4. Rogue Process Timeouts (Context)
	logger.Log.Info("Starting FFmpeg transcode...")
	
	var ffCtx context.Context
	var ffCancel context.CancelFunc
	if job.Type == "Live" {
		ffCtx, ffCancel = context.WithCancel(ctx)
	} else {
		ffCtx, ffCancel = context.WithTimeout(ctx, 2*time.Hour)
	}
	defer ffCancel()

	args := []string{
		"-y",
		"-i", inputPath,
		"-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?",
		"-c:v", encoder, "-preset", preset, "-c:a", "aac",
		"-b:v:0", "5000k", "-s:v:0", "1920x1080",
		"-b:v:1", "2800k", "-s:v:1", "1280x720",
		"-b:v:2", "800k", "-s:v:2", "640x360",
		"-g", "120",
		"-f", "hls",
		"-hls_time", "4",
	}

	if job.Type == "Live" {
		args = append(args,
			"-hls_list_size", "20",
			"-hls_flags", "temp_file+delete_segments",
		)
	} else {
		args = append(args, "-hls_playlist_type", "vod")
	}

	args = append(args,
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:360p",
		filepath.Join(tempDir, "%v/playlist.m3u8"),
	)
	
	cmd := exec.CommandContext(ffCtx, "ffmpeg", args...)
	
	// 4. Real-Time Progress Tracking (Channels)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	
	if err := cmd.Start(); err != nil {
		return err
	}

	progressChan := make(chan string)

	// Producer: Parse stderr and send to channel
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "time=") {
				select {
				case progressChan <- line:
				default:
				}
			} else {
				log.Println("FFmpeg:", line)
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("Error scanning FFmpeg stderr: %v\n", err)
		}
		close(progressChan)
	}()

	// Consumer/Aggregator: Debounce progress updates to once every 5 seconds
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		
		var lastProgress string
		for {
			select {
			case p, ok := <-progressChan:
				if !ok {
					return // channel closed, processing complete
				}
				lastProgress = p
			case <-ticker.C:
				if lastProgress != "" {
					w.mu.Lock()
					w.activeJobs[job.VideoID] = "Processing: " + lastProgress
					w.mu.Unlock()
				}
			}
		}
	}()

	if job.Type == "Live" {
		watcher, err := fsnotify.NewWatcher()
		if err != nil {
			return err
		}
		defer watcher.Close()

		filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
			if err == nil && info.IsDir() {
				watcher.Add(path)
			}
			return nil
		})

		go func() {
			for {
				select {
				case event, ok := <-watcher.Events:
					if !ok {
						return
					}
					if event.Has(fsnotify.Create) {
						info, err := os.Stat(event.Name)
						if err == nil && info.IsDir() {
							watcher.Add(event.Name)
							continue
						}
					}
					if event.Has(fsnotify.Create) || event.Has(fsnotify.Rename) || event.Has(fsnotify.Write) {
						if strings.HasSuffix(event.Name, ".tmp") {
							continue
						}
						if strings.HasSuffix(event.Name, ".ts") || strings.HasSuffix(event.Name, ".m3u8") {
							relPath, _ := filepath.Rel(tempDir, event.Name)
							s3Key := fmt.Sprintf("%s/%s", prefix, filepath.ToSlash(relPath))
							
							// Run upload in a small closure to properly scope defer upCancel
							func() {
								upCtx, upCancel := context.WithTimeout(ctx, 10*time.Minute)
								defer upCancel()
								_ = w.S3.UploadFile(upCtx, s3Key, event.Name)
							}()
						}
					}
				case err, ok := <-watcher.Errors:
					if !ok {
						return
					}
					log.Printf("fsnotify error: %v", err)
				}
			}
		}()
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("ffmpeg failed (timeout or error): %w", err)
	}

	if ctx.Err() != nil {
		return fmt.Errorf("worker shutting down, skipping final sweep")
	}

	log.Println("Uploading HLS files to MinIO (Final Sweep)...")
	
	g, gCtx := errgroup.WithContext(ctx)
	g.SetLimit(20)

	err = filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || path == inputPath || strings.HasSuffix(path, ".tmp") {
			return nil
		}

		currentPath := path
		relPath, _ := filepath.Rel(tempDir, currentPath)
		s3Key := fmt.Sprintf("%s/%s", prefix, filepath.ToSlash(relPath))
		
		g.Go(func() error {
			upCtx, upCancel := context.WithTimeout(gCtx, 10*time.Minute)
			defer upCancel()
			return w.S3.UploadFile(upCtx, s3Key, currentPath)
		})
		return nil
	})
	if err != nil {
		return err
	}
	
	if err := g.Wait(); err != nil {
		return err
	}

	updates := map[string]interface{}{
		"status": "Done",
		"url":    masterURL,
	}
	if job.Type == "VOD" {
		updates["type"] = "VOD"
	}
	if durationSeconds > 0 {
		updates["duration"] = durationSeconds
	}
	if generatedThumbURL != "" {
		updates["thumbnail_url"] = generatedThumbURL
	}

	w.DB.Transaction(func(tx *gorm.DB) error {
		var video models.Video
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", job.VideoID).First(&video).Error; err != nil {
			return err
		}
		if video.Status == "Processing" {
			return tx.Model(&video).Updates(updates).Error
		}
		return nil
	})

	return nil
}
