package live

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"streamforge/internal/upload"
)

type WebhookHandler struct {
	s3Service *upload.S3Service
}

func NewWebhookHandler(s3Service *upload.S3Service) *WebhookHandler {
	return &WebhookHandler{
		s3Service: s3Service,
	}
}

type MediaMTXWebhookPayload struct {
	Action string `json:"action" form:"action"`
	Path   string `json:"path" form:"path"`
	Query  string `json:"query" form:"query"`
}

func (h *WebhookHandler) HandleMediaMTXWebhook(c *gin.Context) {
	action := c.Query("action")
	path := c.Query("path")

	if action == "" {
		var payload MediaMTXWebhookPayload
		if err := c.ShouldBind(&payload); err == nil {
			action = payload.Action
			path = payload.Path
		}
	}

	log.Printf("Received MediaMTX Webhook: Action=%s, Path=%s", action, path)

	if action == "publishDone" {
		// Start a goroutine to handle the upload so we don't block the webhook response
		go h.processRecording(path)
	}

	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

func (h *WebhookHandler) processRecording(streamPath string) {
	recordingsDir := "../recordings"
	maxRetries := 5
	
	for i := 0; i < maxRetries; i++ {
		// Wait a moment to ensure MediaMTX has fully flushed the file to disk
		time.Sleep(3 * time.Second)

		files, err := os.ReadDir(recordingsDir)
		if err != nil {
			log.Printf("Error reading recordings directory: %v", err)
			return
		}

		success := false
		found := false
		for _, f := range files {
			// Look for files like demo_1712345678.mp4
			if !f.IsDir() && strings.HasPrefix(f.Name(), streamPath+"_") && strings.HasSuffix(f.Name(), ".mp4") {
				found = true
				hostRecordPath := recordingsDir + "/" + f.Name()
				objectKey := fmt.Sprintf("videos/%d_live_%s", time.Now().Unix(), f.Name())
				
				log.Printf("Uploading recording %s to MinIO as %s...", hostRecordPath, objectKey)

				err := h.s3Service.UploadFile(context.Background(), objectKey, hostRecordPath)
				if err != nil {
					log.Printf("Failed to upload live stream recording: %v", err)
					continue
				}

				success = true
				log.Printf("Successfully uploaded live stream recording to MinIO.")

				// Cleanup the local file
				if err := os.Remove(hostRecordPath); err != nil {
					log.Printf("Failed to clean up local recording file: %v", err)
				}
			}
		}

		if success {
			return // Successfully processed the recording
		}
		
		if !found {
			log.Printf("Recording not found yet, retrying... (%d/%d)", i+1, maxRetries)
		} else {
			log.Printf("Recording found but upload failed (locked?), retrying... (%d/%d)", i+1, maxRetries)
		}
	}
	log.Printf("Failed to find recording for stream %s after %d retries.", streamPath, maxRetries)
}
