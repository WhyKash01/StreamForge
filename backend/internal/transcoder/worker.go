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
	"strings"
	"sync"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"

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
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-quit
		logger.Log.Info("Received shutdown signal. Stopping AMQP consumer to gracefully shutdown...")
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

			err := w.processJob(job)
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
					w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Update("status", "Failed")
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

func (w *Worker) processJob(job metadata.TranscodeJob) error {
	w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Update("status", "Processing")

	var objectKey string
	if strings.HasPrefix(job.URL, "s3://") {
		parts := strings.SplitN(strings.TrimPrefix(job.URL, "s3://"), "/", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid s3 URL: %s", job.URL)
		}
		objectKey = parts[1]
	} else {
		return fmt.Errorf("unsupported URL format for transcode: %s", job.URL)
	}

	tempDir := fmt.Sprintf("/tmp/transcode/%d", job.VideoID)
	os.RemoveAll(tempDir)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "input.mp4")
	
	logger.Log.Info("Downloading file from S3", zap.String("objectKey", objectKey))
	dlCtx, dlCancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer dlCancel()
	
	if err := w.S3.DownloadFile(dlCtx, objectKey, inputPath); err != nil {
		return err
	}

	// 3. Rogue Process Timeouts (Context)
	logger.Log.Info("Starting FFmpeg transcode...")
	ffCtx, ffCancel := context.WithTimeout(context.Background(), 2*time.Hour)
	defer ffCancel()

	cmd := exec.CommandContext(ffCtx, "ffmpeg",
		"-y",
		"-i", inputPath,
		"-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?",
		"-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
		"-b:v:0", "5000k", "-s:v:0", "1920x1080", "-profile:v:0", "main",
		"-b:v:1", "2800k", "-s:v:1", "1280x720", "-profile:v:1", "main",
		"-b:v:2", "1400k", "-s:v:2", "854x480", "-profile:v:2", "main",
		"-b:v:3", "800k", "-s:v:3", "640x360", "-profile:v:3", "main",
		"-g", "120",
		"-f", "hls",
		"-hls_time", "4",
		"-hls_playlist_type", "vod",
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p v:3,a:3,name:360p",
		filepath.Join(tempDir, "%v/playlist.m3u8"),
	)
	
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

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("ffmpeg failed (timeout or error): %w", err)
	}

	log.Println("Uploading HLS files to MinIO...")
	prefix := fmt.Sprintf("hls/%d_%d", job.VideoID, time.Now().Unix())
	
	err = filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || path == inputPath {
			return nil
		}

		relPath, _ := filepath.Rel(tempDir, path)
		s3Key := fmt.Sprintf("%s/%s", prefix, relPath)
		
		upCtx, upCancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer upCancel()
		return w.S3.UploadFile(upCtx, s3Key, path)
	})
	if err != nil {
		return err
	}

	masterURL := fmt.Sprintf("s3://%s/%s/master.m3u8", w.S3.BucketName, prefix)
	w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Updates(map[string]interface{}{
		"status": "Done",
		"url":    masterURL,
	})

	return nil
}
