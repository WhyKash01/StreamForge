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

	isSubscribed := false
	if userIDVal, exists := c.Get("userID"); exists {
		userID := userIDVal.(uint)
		var sub models.Subscription
		if err := h.DB.Where("subscriber_id = ? AND channel_id = ?", userID, user.ID).First(&sub).Error; err == nil {
			isSubscribed = true
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"channel": gin.H{
			"id":              user.ID,
			"username":        user.Username,
			"display_name":    user.DisplayName,
			"avatar_url":      user.AvatarURL,
			"banner_url":      user.BannerURL,
			"bio":             user.Bio,
			"is_verified":     user.IsVerified,
			"followers_count": user.FollowersCount,
			"following_count": user.FollowingCount,
			"videos":          user.Videos,
			"is_subscribed":   isSubscribed,
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

func (h *Handler) ToggleSubscription(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	subscriberID := userIDVal.(uint)
	channelIDStr := c.Param("id")
	channelID, err := strconv.ParseUint(channelIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid channel ID"})
		return
	}

	if subscriberID == uint(channelID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot subscribe to yourself"})
		return
	}

	var channelUser models.User
	if err := h.DB.First(&channelUser, channelID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Channel not found"})
		return
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var sub models.Subscription
		err := tx.Where("subscriber_id = ? AND channel_id = ?", subscriberID, channelID).First(&sub).Error

		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		if err == gorm.ErrRecordNotFound {
			// Subscribe
			if err := tx.Create(&models.Subscription{SubscriberID: subscriberID, ChannelID: uint(channelID), CreatedAt: time.Now()}).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.User{}).Where("id = ?", channelID).UpdateColumn("followers_count", gorm.Expr("followers_count + ?", 1)).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.User{}).Where("id = ?", subscriberID).UpdateColumn("following_count", gorm.Expr("following_count + ?", 1)).Error; err != nil {
				return err
			}
		} else {
			// Unsubscribe
			if err := tx.Delete(&sub).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.User{}).Where("id = ?", channelID).UpdateColumn("followers_count", gorm.Expr("followers_count - ?", 1)).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.User{}).Where("id = ?", subscriberID).UpdateColumn("following_count", gorm.Expr("following_count - ?", 1)).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to toggle subscription"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Subscription toggled successfully"})
}

func (h *Handler) GetVideoPlayback(c *gin.Context) {
	id := c.Param("id")

	var video models.Video

	if err := h.DB.Preload("User").First(&video, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	// We only want to serve playback for processed VODs or active Live streams
	if video.Status != "Done" && video.Status != "Live" && !(video.Status == "Processing" && video.Type == "Live") {
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
	}

	resp := gin.H{
		"playback_url":   cdnURL,
		"title":          video.Title,
		"description":    video.Description,
		"type":           video.Type,
		"status":         video.Status,
		"category":       video.Category,
		"tags":           video.Tags,
		"views":          video.Views,
		"likes_count":    video.LikesCount,
		"dislikes_count": video.DislikesCount,
		"created_at":     video.CreatedAt,
		"channel": gin.H{
			"id":           video.User.ID,
			"username":     video.User.Username,
			"display_name": video.User.DisplayName,
			"avatar_url":   video.User.AvatarURL,
			"followers_count": video.User.FollowersCount,
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

type UpdateUserRequest struct {
	DisplayName string `json:"display_name"`
	Bio         string `json:"bio"`
	AvatarURL   string `json:"avatar_url"`
	BannerURL   string `json:"banner_url"`
}

func (h *Handler) UpdateUser(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"display_name": req.DisplayName,
		"bio":          req.Bio,
		"avatar_url":   req.AvatarURL,
		"banner_url":   req.BannerURL,
	}

	if err := h.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User updated successfully"})
}

type UpdateVideoRequest struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	Category     string `json:"category"`
	ThumbnailURL string `json:"thumbnail_url"`
	Tags         string `json:"tags"`
}

func (h *Handler) UpdateVideo(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)
	videoID := c.Param("id")

	var video models.Video
	if err := h.DB.First(&video, videoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	if video.UserID != uint(userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
		return
	}

	var req UpdateVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	videoUpdates := map[string]interface{}{
		"title":         req.Title,
		"description":   req.Description,
		"category":      req.Category,
		"thumbnail_url": req.ThumbnailURL,
		"tags":          req.Tags,
	}

	if err := h.DB.Model(&video).Updates(videoUpdates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update video"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Video updated successfully"})
}

func (h *Handler) RecordView(c *gin.Context) {
	idStr := c.Param("id")
	videoID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	ipAddress := c.ClientIP()
	
	var userIDPtr *uint
	if userIDVal, exists := c.Get("userID"); exists {
		id := userIDVal.(uint)
		userIDPtr = &id
	}

	cutoffTime := time.Now().Add(-24 * time.Hour)

	// Check if view already exists recently
	var count int64
	query := h.DB.Model(&models.VideoView{}).Where("video_id = ? AND viewed_at > ?", videoID, cutoffTime)
	
	if userIDPtr != nil {
		query = query.Where("user_id = ?", *userIDPtr)
	} else {
		query = query.Where("ip_address = ?", ipAddress)
	}

	query.Count(&count)

	if count > 0 {
		c.JSON(http.StatusOK, gin.H{"message": "View already recorded recently"})
		return
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		view := models.VideoView{
			VideoID:   uint(videoID),
			UserID:    userIDPtr,
			IPAddress: ipAddress,
			ViewedAt:  time.Now(),
		}
		if err := tx.Create(&view).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.Video{}).Where("id = ?", videoID).UpdateColumn("views", gorm.Expr("views + ?", 1)).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record view"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "View recorded successfully"})
}

func (h *Handler) GetSubscribedChannels(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	subscriberID := userIDVal.(uint)

	var subscriptions []models.Subscription
	if err := h.DB.Where("subscriber_id = ?", subscriberID).Find(&subscriptions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions"})
		return
	}

	if len(subscriptions) == 0 {
		c.JSON(http.StatusOK, gin.H{"channels": []models.User{}})
		return
	}

	var channelIDs []uint
	for _, sub := range subscriptions {
		channelIDs = append(channelIDs, sub.ChannelID)
	}

	var channels []models.User
	if err := h.DB.Where("id IN ?", channelIDs).Select("id", "username", "display_name", "avatar_url", "followers_count", "bio", "is_verified").Find(&channels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch channels"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"channels": channels})
}
