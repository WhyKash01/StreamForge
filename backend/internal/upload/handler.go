package upload

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"math/rand"

	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	s3Service *S3Service
	db        *gorm.DB
}

func NewHandler(s3Service *S3Service, db *gorm.DB) *Handler {
	return &Handler{
		s3Service: s3Service,
		db:        db,
	}
}

type InitUploadRequest struct {
	Title                string `json:"title" binding:"required"`
	Description          string `json:"description"`
	Filename             string `json:"filename" binding:"required"`
	ContentType          string `json:"contentType" binding:"required"`
	HasThumbnail         bool   `json:"hasThumbnail"`
	ThumbnailContentType string `json:"thumbnailContentType"`
}

var defaultThumbnails = []string{
	"/defaults/thumb1_1785606437916.png",
	"/defaults/thumb2_1785606448887.png",
	"/defaults/thumb3_1785606458871.png",
	"/defaults/thumb4_1785606468051.png",
	"/defaults/thumb5_1785606479399.png",
}

// HandleInitUpload creates a Video DB record and returns presigned URLs
func (h *Handler) HandleInitUpload(c *gin.Context) {
	var req InitUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("userID")

	// Ensure safe filename
	safeFilename := strings.ReplaceAll(req.Filename, " ", "_")
	ext := filepath.Ext(safeFilename)
	if ext == "" {
		safeFilename += ".mp4"
	}
	videoKey := fmt.Sprintf("videos/%d/%d_%s", userID, time.Now().Unix(), safeFilename)

	thumbnailURL := ""
	var thumbKey string
	if req.HasThumbnail {
		// Generate thumbnail key
		thumbExt := ".jpg"
		if req.ThumbnailContentType == "image/png" {
			thumbExt = ".png"
		} else if req.ThumbnailContentType == "image/webp" {
			thumbExt = ".webp"
		}
		thumbKey = fmt.Sprintf("thumbnails/%d/%d_thumb%s", userID, time.Now().Unix(), thumbExt)
		thumbnailURL = "http://localhost:9000/streamforge/" + thumbKey // Will be replaced by MinIO public URL or similar in real app
	} else {
		// Assign random default thumbnail
		rand.Seed(time.Now().UnixNano())
		thumbnailURL = defaultThumbnails[rand.Intn(len(defaultThumbnails))]
	}

	video := models.Video{
		Title:        req.Title,
		Description:  req.Description,
		URL:          "s3://streamforge/" + videoKey, // Placeholder until webhook triggers
		Type:         "VOD",
		Status:       "Pending", // Wait for MinIO webhook to change this to Uploaded
		ThumbnailURL: thumbnailURL,
		UserID:       userID,
	}

	if err := h.db.Create(&video).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create video record"})
		return
	}

	videoPresignedURL, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), videoKey, req.ContentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate video URL: " + err.Error()})
		return
	}

	var thumbPresignedURL string
	if req.HasThumbnail {
		thumbPresignedURL, err = h.s3Service.GeneratePresignedURL(c.Request.Context(), thumbKey, req.ThumbnailContentType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate thumbnail URL: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"videoId":               video.ID,
		"videoPresignedUrl":     videoPresignedURL,
		"thumbnailPresignedUrl": thumbPresignedURL,
		"thumbnailUrl":          thumbnailURL, // The final public URL to display (for defaults)
	})
}

type LiveSettingsRequest struct {
	Title                string `json:"title" binding:"required"`
	Description          string `json:"description"`
	HasThumbnail         bool   `json:"hasThumbnail"`
	ThumbnailContentType string `json:"thumbnailContentType"`
}

// HandleLiveSettings updates user live stream settings and returns thumbnail presigned URL
func (h *Handler) HandleLiveSettings(c *gin.Context) {
	var req LiveSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetUint("userID")

	thumbnailURL := ""
	var thumbKey string
	if req.HasThumbnail {
		thumbExt := ".jpg"
		switch req.ThumbnailContentType {
		case "image/png":
			thumbExt = ".png"
		case "image/webp":
			thumbExt = ".webp"
		}
		thumbKey = fmt.Sprintf("thumbnails/%d/%d_live_thumb%s", userID, time.Now().Unix(), thumbExt)
		thumbnailURL = "http://localhost:9000/streamforge/" + thumbKey
	} else {
		rand.Seed(time.Now().UnixNano())
		thumbnailURL = defaultThumbnails[rand.Intn(len(defaultThumbnails))]
	}

	if err := h.db.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"live_title":         req.Title,
		"live_description":   req.Description,
		"live_thumbnail_url": thumbnailURL,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update live settings"})
		return
	}

	// Also update the active live stream video if they are currently broadcasting
	h.db.Model(&models.Video{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "Live", "Live").
		Updates(map[string]interface{}{
			"title":         req.Title,
			"description":   req.Description,
			"thumbnail_url": thumbnailURL,
		})

	var thumbPresignedURL string
	var err error
	if req.HasThumbnail {
		thumbPresignedURL, err = h.s3Service.GeneratePresignedURL(c.Request.Context(), thumbKey, req.ThumbnailContentType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate thumbnail URL"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"thumbnailPresignedUrl": thumbPresignedURL,
		"thumbnailUrl":          thumbnailURL,
		"message":               "Live settings updated successfully",
	})
}

// GetLiveStatus returns the user's current live stream status (Live, Uploading, Offline)
func (h *Handler) GetLiveStatus(c *gin.Context) {
	userID := c.GetUint("userID")

	var video models.Video
	if err := h.db.Where("user_id = ? AND (type = 'Live' OR url LIKE '%_syslive_%')", userID).Order("created_at desc").First(&video).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "Offline"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": video.Status,
		"video_id": video.ID,
	})
}

// HandlePresignedURL (Legacy - Keep for now if needed by other tools)
func (h *Handler) HandlePresignedURL(c *gin.Context) {
	filename := c.Query("filename")
	contentType := c.Query("contentType")

	if filename == "" || contentType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename and contentType are required"})
		return
	}

	safeFilename := strings.ReplaceAll(filename, " ", "_")
	ext := filepath.Ext(safeFilename)
	if ext == "" {
		safeFilename += ".mp4"
	}

	userID := c.GetUint("userID")
	objectKey := fmt.Sprintf("videos/%d/%d_%s", userID, time.Now().Unix(), safeFilename)

	url, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), objectKey, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate presigned URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"presignedUrl": url,
		"objectKey":    objectKey,
	})
}

// HandleListVideos fetches all video objects and generates pre-signed URLs for viewing
func (h *Handler) HandleListVideos(c *gin.Context) {
	keys, err := h.s3Service.ListVideos(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list videos"})
		return
	}

	type VideoResponse struct {
		Key string `json:"key"`
		URL string `json:"url"`
	}

	var videos []VideoResponse
	for _, key := range keys {
		url, err := h.s3Service.GeneratePresignedGetURL(c.Request.Context(), key)
		if err != nil {
			continue // Skip if we can't generate URL
		}
		videos = append(videos, VideoResponse{
			Key: key,
			URL: url,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"videos": videos,
	})
}
