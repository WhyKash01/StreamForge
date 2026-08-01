package metadata

import (
	"net/http"
	"strconv"

	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	DB *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{DB: db}
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

	// Transform the internal s3:// URL into a public CDN URL (MinIO for local dev)
	// Example: s3://streamforge/hls/1/master.m3u8 -> http://localhost:9000/streamforge/hls/1/master.m3u8
	cdnURL := video.URL
	if len(cdnURL) > 5 && cdnURL[:5] == "s3://" {
		cdnURL = "http://localhost:9000/" + cdnURL[5:]
	} else if len(cdnURL) > 7 && cdnURL[:7] == "rtmp://" {
		// If it's a live stream still broadcasting, provide the HLS stream from MediaMTX
		// rtmp://localhost/1935/demo -> http://localhost:8888/demo/index.m3u8
		path := cdnURL[22:] // stripping rtmp://localhost:1935/
		cdnURL = "http://localhost:8888/" + path + "/index.m3u8"
	}

	c.JSON(http.StatusOK, gin.H{
		"playback_url": cdnURL,
		"title":        video.Title,
		"channel": gin.H{
			"username":     video.User.Username,
			"display_name": video.User.DisplayName,
			"avatar_url":   video.User.AvatarURL,
		},
	})
}

func (h *Handler) GetVideoStatus(c *gin.Context) {
	id := c.Param("id")
	var video models.Video

	if err := h.DB.Select("status").First(&video, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": video.Status,
	})
}
