package metadata

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"streamforge/internal/models"
	"streamforge/internal/upload"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type Handler struct {
	DB    *gorm.DB
	S3    *upload.S3Service
	Redis *redis.Client
}

func NewHandler(db *gorm.DB, s3 *upload.S3Service, rdb *redis.Client) *Handler {
	return &Handler{DB: db, S3: s3, Redis: rdb}
}

func (h *Handler) ListVideos(c *gin.Context) {
	var videos []models.Video
	if err := h.DB.Preload("User").Find(&videos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, videos)
}

func (h *Handler) GetChannel(c *gin.Context) {
	username := c.Param("username")
	var user models.User

	if err := h.DB.Preload("Videos").Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Channel not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"channel": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"avatar_url":   user.AvatarURL,
			"bio":          user.Bio,
			"videos":       user.Videos,
		},
	})
}

func (h *Handler) GetUserVideos(c *gin.Context) {
	userIDStr := c.Param("user_id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var videos []models.Video
	if err := h.DB.Where("user_id = ?", userID).Find(&videos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, videos)
}

func (h *Handler) GetVideoPlayback(c *gin.Context) {
	id := c.Param("id")

	var video models.Video

	if err := h.DB.Preload("User").First(&video, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	// We only want to serve playback for processed VODs or active Live streams
	if video.Status != "Done" && video.Status != "Live" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video is not ready for playback"})
		return
	}

	// Transform the internal s3:// URL into a public CDN URL or pre-signed URL
	cdnURL := video.URL
	if len(cdnURL) > 5 && cdnURL[:5] == "s3://" {
		// If it's a VOD (s3://), generate a pre-signed GET URL for secure playback
		objectKey := cdnURL[5:] // e.g. streamforge/hls/1/master.m3u8
		// Remove the bucket name from objectKey since S3Service expects the key inside the bucket
		// Assuming the URL is s3://bucketname/key
		parts := strings.SplitN(objectKey, "/", 2)
		if len(parts) == 2 {
			objectKey = parts[1]
			// The bucket is public for download, so just construct the public URL!
			// Using localhost:9000 for local dev, and add a cache buster so browser disk cache doesn't serve old DB wipe files
			cdnURL = fmt.Sprintf("http://localhost:9000/streamforge/%s?t=%d", objectKey, time.Now().Unix())
		}
	} else if len(cdnURL) > 7 && cdnURL[:7] == "rtmp://" {
		// If it's a live stream still broadcasting, provide the HLS stream from MediaMTX
		// rtmp://localhost:1935/live/demo -> http://localhost:8888/live/demo/index.m3u8
		path := cdnURL[22:] // stripping rtmp://localhost:1935/
		cdnURL = "http://localhost:8888/" + path + "/index.m3u8"
	}

	resp := gin.H{
		"playback_url": cdnURL,
		"title":        video.Title,
		"channel": gin.H{
			"id":           video.User.ID,
			"username":     video.User.Username,
			"display_name": video.User.DisplayName,
			"avatar_url":   video.User.AvatarURL,
		},
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) GetVideoStatus(c *gin.Context) {
	id := c.Param("id")
	var video models.Video

	if err := h.DB.Select("status").First(&video, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	resp := gin.H{"status": video.Status}

	// Bridge real-time Transcoder progress
	if video.Status == "Processing" {
		// Ping the transcoder worker's health endpoint (timeout after 500ms to avoid blocking API)
		client := http.Client{Timeout: 500 * time.Millisecond}
		if res, err := client.Get("http://localhost:8082/health"); err == nil {
			defer res.Body.Close()
			var healthData struct {
				ActiveJobs map[string]string `json:"active_jobs"`
			}
			if err := json.NewDecoder(res.Body).Decode(&healthData); err == nil {
				if progress, ok := healthData.ActiveJobs[id]; ok {
					resp["progress"] = progress
				}
			}
		}
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) DeleteVideo(c *gin.Context) {
	userID := c.GetUint("userID")
	videoIDParam := c.Param("id")

	videoID, err := strconv.ParseUint(videoIDParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	var video models.Video
	if err := h.DB.First(&video, videoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	if video.UserID != uint(userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this video"})
		return
	}

	// Delete from DB
	if err := h.DB.Delete(&video).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete video"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Video deleted successfully"})
}
