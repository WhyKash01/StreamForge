package metadata

import (
	"net/http"

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
	var videos []Video
	if err := h.DB.Find(&videos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, videos)
}

func (h *Handler) GetVideoPlayback(c *gin.Context) {
	id := c.Param("id")
	var video Video
	
	if err := h.DB.First(&video, id).Error; err != nil {
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
	})
}
