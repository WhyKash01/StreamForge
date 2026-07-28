package upload

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	s3Service *S3Service
}

func NewHandler(s3Service *S3Service) *Handler {
	return &Handler{
		s3Service: s3Service,
	}
}

// HandlePresignedURL generates a pre-signed URL for direct-to-S3 uploads
func (h *Handler) HandlePresignedURL(c *gin.Context) {
	filename := c.Query("filename")
	contentType := c.Query("contentType")

	if filename == "" || contentType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "filename and contentType are required"})
		return
	}

	// Ensure safe and unique key
	safeFilename := strings.ReplaceAll(filename, " ", "_")

	ext := filepath.Ext(safeFilename)
	if ext == "" {
		safeFilename += ".mp4"
	}

	objectKey := fmt.Sprintf("videos/%d_%s", time.Now().Unix(), safeFilename)

	url, err := h.s3Service.GeneratePresignedURL(c.Request.Context(), objectKey, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate presigned URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"presignedUrl": url,
		"objectKey":    objectKey,
		"message":      "Pre-signed URL generated successfully",
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
