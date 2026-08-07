package live

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"streamforge/internal/models"
	"streamforge/internal/upload"
)

type WebhookHandler struct {
	s3Service *upload.S3Service
	db        *gorm.DB
}

func NewWebhookHandler(s3Service *upload.S3Service, db *gorm.DB) *WebhookHandler {
	return &WebhookHandler{
		s3Service: s3Service,
		db:        db,
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
	
	fLog, _ := os.OpenFile("process_log.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	defer fLog.Close()
	fLog.WriteString(fmt.Sprintf("processRecording started for %s\n", streamPath))

	
	segments := strings.Split(streamPath, "/")
	streamKey := segments[len(segments)-1]
	
	for i := 0; i < maxRetries; i++ {
		// Wait a moment to ensure MediaMTX has fully flushed the file to disk
		time.Sleep(3 * time.Second)

		success := false
		found := false

		var newestFile string
		var newestModTime int64
		
		_ = filepath.WalkDir(recordingsDir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // skip errors
			}
			fLog.WriteString(fmt.Sprintf("Checking %s, isDir=%v\n", path, d.IsDir()))
			if !d.IsDir() && strings.Contains(path, streamKey) && strings.HasSuffix(d.Name(), ".mp4") {
				info, err := d.Info()
				if err == nil {
					if info.ModTime().UnixNano() > newestModTime {
						newestModTime = info.ModTime().UnixNano()
						newestFile = path
					}
				}
			}
			return nil
		})
		
		if newestFile != "" {
			fLog.WriteString(fmt.Sprintf("MATCHED NEWEST FILE %s!\n", newestFile))
			found = true
			var user models.User
			userID := uint(0)
			if err := h.db.Where("stream_key = ?", streamKey).First(&user).Error; err == nil {
				userID = user.ID
			}
			
			objectKey := fmt.Sprintf("videos/%d/%d_syslive_%s", userID, time.Now().Unix(), filepath.Base(newestFile))
			
			fLog.WriteString(fmt.Sprintf("Uploading to %s...\n", objectKey))
			err := h.s3Service.UploadFile(context.Background(), objectKey, newestFile)
			if err != nil {
				fLog.WriteString(fmt.Sprintf("Upload failed: %v\n", err))
				log.Printf("Failed to upload live stream recording: %v", err)
				continue // retry loop
			}

			success = true
			fLog.WriteString("Upload successful!\n")
			log.Printf("Successfully uploaded live stream recording to MinIO.")

			// Cleanup all matching files for this streamKey to prevent buildup
			filepath.WalkDir(recordingsDir, func(p string, d os.DirEntry, err error) error {
				if err == nil && !d.IsDir() && strings.Contains(p, streamKey) && strings.HasSuffix(d.Name(), ".mp4") {
					os.Remove(p)
				}
				return nil
			})
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

func (h *WebhookHandler) HandleMediaMTXAuth(c *gin.Context) {
	var payload struct {
		Action   string `json:"action"`
		Path     string `json:"path"`
		User     string `json:"user"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	// Allow all read requests (viewers)
	if payload.Action == "read" {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	// For publish requests, authenticate using the stream key from the path
	if payload.Action == "publish" {
		segments := strings.Split(payload.Path, "/")
		streamKey := segments[len(segments)-1]
		
		var user models.User
		if err := h.db.Where("stream_key = ?", streamKey).First(&user).Error; err != nil {
			log.Printf("Rejected publish for path %s: Invalid stream key", payload.Path)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		log.Printf("Accepted publish for user %s with stream key %s", user.Username, payload.Path)
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	// Default allow other actions
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
