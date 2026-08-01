package transcoder

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"

	"streamforge/internal/metadata"
	"streamforge/internal/models"
	"streamforge/internal/upload"
)

type Worker struct {
	DB   *gorm.DB
	S3   *upload.S3Service
	AMQP *amqp.Connection
}

func (w *Worker) Start() error {
	ch, err := w.AMQP.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	q, err := ch.QueueDeclare(
		"transcode_queue",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
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

	log.Println("Transcoder Worker started. Waiting for jobs...")

	for d := range msgs {
		var job metadata.TranscodeJob
		if err := json.Unmarshal(d.Body, &job); err != nil {
			log.Printf("Failed to unmarshal job: %v\n", err)
			d.Nack(false, false)
			continue
		}

		log.Printf("Received transcode job for Video ID %d: %s\n", job.VideoID, job.URL)
		
		err := w.processJob(job)
		if err != nil {
			log.Printf("Failed to process job for Video %d: %v\n", job.VideoID, err)
			w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Update("status", "Failed")
			d.Nack(false, false) // Drop the message instead of infinitely requeuing
		} else {
			log.Printf("Successfully processed job for Video %d\n", job.VideoID)
			d.Ack(false)
		}
	}
	return nil
}

func (w *Worker) processJob(job metadata.TranscodeJob) error {
	// 1. Update status
	w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Update("status", "Processing")

	// 2. Extract object key from URL (e.g. s3://streamforge/videos/123.mp4 or rtmp://...)
	var objectKey string
	if strings.HasPrefix(job.URL, "s3://") {
		parts := strings.SplitN(strings.TrimPrefix(job.URL, "s3://"), "/", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid s3 URL: %s", job.URL)
		}
		objectKey = parts[1]
	} else {
		// Currently only supporting S3 VODs for transcode
		return fmt.Errorf("unsupported URL format for transcode: %s", job.URL)
	}

	tempDir := fmt.Sprintf("/tmp/transcode/%d", job.VideoID)
	os.RemoveAll(tempDir) // Ensure clean slate in case of previous crash or DB reset
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "input.mp4")
	
	// 3. Download from MinIO
	log.Printf("Downloading %s to %s...\n", objectKey, inputPath)
	if err := w.S3.DownloadFile(context.Background(), objectKey, inputPath); err != nil {
		return err
	}

	// 4. Run FFmpeg
	log.Println("Starting FFmpeg transcode...")
	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", inputPath,
		"-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?", "-map", "0:v:0", "-map", "0:a:0?",
		"-c:v", "libx264", "-c:a", "aac",
		"-b:v:0", "5000k", "-s:v:0", "1920x1080", "-profile:v:0", "main",
		"-b:v:1", "2800k", "-s:v:1", "1280x720", "-profile:v:1", "main",
		"-b:v:2", "1400k", "-s:v:2", "854x480", "-profile:v:2", "main",
		"-f", "hls",
		"-hls_time", "10",
		"-hls_playlist_type", "vod",
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:480p",
		filepath.Join(tempDir, "%v/playlist.m3u8"),
	)
	
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg failed: %w", err)
	}

	// 5. Upload resulting files back to S3
	log.Println("Uploading HLS files to MinIO...")
	prefix := fmt.Sprintf("hls/%d", job.VideoID)
	
	err := filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		
		if path == inputPath {
			return nil // Don't upload the input file
		}

		relPath, _ := filepath.Rel(tempDir, path)
		s3Key := fmt.Sprintf("%s/%s", prefix, relPath)
		
		return w.S3.UploadFile(context.Background(), s3Key, path)
	})
	if err != nil {
		return err
	}

	// 6. Update DB
	masterURL := fmt.Sprintf("s3://%s/%s/master.m3u8", w.S3.BucketName, prefix)
	w.DB.Model(&models.Video{}).Where("id = ?", job.VideoID).Updates(map[string]interface{}{
		"status": "Done",
		"url":    masterURL,
	})

	return nil
}
