package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"streamforge/internal/models"
	"streamforge/internal/upload"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
)

type Handler struct {
	DB      *gorm.DB
	S3      *upload.S3Service
	Redis   *redis.Client
	sfGroup singleflight.Group
}

func NewHandler(db *gorm.DB, s3 *upload.S3Service, rdb *redis.Client) *Handler {
	return &Handler{
		DB:    db,
		S3:    s3,
		Redis: rdb,
	}
}

func (h *Handler) ListVideos(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "20")
	q := strings.TrimSpace(c.Query("q"))
	category := strings.TrimSpace(c.Query("category"))
	videoType := strings.TrimSpace(c.Query("type"))
	isPaginateExplicit := c.Query("paginate") == "true" || c.Query("page") != "" || c.Query("limit") != "" || q != "" || category != "" || videoType != ""

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	query := h.DB.Model(&models.Video{}).Preload("User")

	// Filter by public visibility
	query = query.Where("visibility = ?", "public")

	// Search filter on title, tags, description
	if q != "" {
		likeTerm := "%" + q + "%"
		query = query.Where("title ILIKE ? OR tags ILIKE ? OR description ILIKE ?", likeTerm, likeTerm, likeTerm)
	}

	// Category filter
	if category != "" && category != "all" {
		query = query.Where("category = ?", category)
	}

	// Type filter (Live vs VOD)
	if videoType != "" && videoType != "all" {
		query = query.Where("type = ?", videoType)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count videos"})
		return
	}

	// Sort logic: Active 'Live' status pinned to top, followed by newest created_at
	query = query.Order("CASE WHEN status = 'Live' THEN 1 WHEN type = 'Live' AND status = 'Processing' THEN 2 ELSE 3 END ASC, created_at DESC")

	var videos []models.Video
	if err := query.Limit(limit).Offset(offset).Find(&videos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if isPaginateExplicit {
		c.JSON(http.StatusOK, gin.H{
			"videos":   videos,
			"total":    total,
			"page":     page,
			"limit":    limit,
			"has_more": int64(offset+len(videos)) < total,
		})
		return
	}

	c.JSON(http.StatusOK, videos)
}

func (h *Handler) GetChannel(c *gin.Context) {
	username := c.Param("username")
	ctx := c.Request.Context()

	var userIDVal interface{}
	var hasAuth bool
	userIDVal, hasAuth = c.Get("userID")

	// If anonymous read, check Redis cache first
	cacheKey := fmt.Sprintf("channel:public:%s", username)
	if !hasAuth && h.Redis != nil {
		if cached, err := h.Redis.Get(ctx, cacheKey).Result(); err == nil && cached != "" {
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(cached))
			return
		}
	}

	var user models.User
	if err := h.DB.Preload("Videos").Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Channel not found"})
		return
	}

	isSubscribed := false
	if hasAuth {
		userID := userIDVal.(uint)
		var sub models.Subscription
		if err := h.DB.Where("subscriber_id = ? AND channel_id = ?", userID, user.ID).First(&sub).Error; err == nil {
			isSubscribed = true
		}
	}

	resp := gin.H{
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
		"is_subscribed": isSubscribed,
	}

	// Cache public profile in Redis for 5 minutes
	if !hasAuth && h.Redis != nil {
		if jsonBytes, err := json.Marshal(resp); err == nil {
			_ = h.Redis.Set(ctx, cacheKey, jsonBytes, 5*time.Minute)
		}
	}

	c.JSON(http.StatusOK, resp)
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

	var isSubscribed bool
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
			isSubscribed = true
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
			isSubscribed = false
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to toggle subscription"})
		return
	}

	// Invalidate public channel cache
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("channel:public:%s", channelUser.Username))
	}

	var updatedChannel models.User
	_ = h.DB.Select("followers_count").First(&updatedChannel, channelID)

	c.JSON(http.StatusOK, gin.H{
		"message":         "Subscription toggled successfully",
		"subscribed":      isSubscribed,
		"is_subscribed":   isSubscribed,
		"followers_count": updatedChannel.FollowersCount,
	})
}

// GetVideoPlayback uses the Cache-Aside pattern with singleflight to eliminate cache stampedes (thundering herd)
func (h *Handler) GetVideoPlayback(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()
	cacheKey := fmt.Sprintf("video:playback:%s", id)

	// 1. Check Redis cache first (sub-millisecond fast path)
	if h.Redis != nil {
		if cached, err := h.Redis.Get(ctx, cacheKey).Result(); err == nil && cached != "" {
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(cached))
			return
		}
	}

	// 2. Suppress thundering herd / cache stampede with singleflight
	res, err, _ := h.sfGroup.Do(fmt.Sprintf("playback:%s", id), func() (interface{}, error) {
		var video models.Video
		if err := h.DB.Preload("User").First(&video, id).Error; err != nil {
			return nil, err
		}

		// We only serve playback for processed VODs or active Live streams
		if video.Status != "Done" && video.Status != "Live" && !(video.Status == "Processing" && video.Type == "Live") {
			return nil, fmt.Errorf("video_not_ready")
		}

		cdnURL := video.URL
		whepURL := ""

		if strings.HasPrefix(cdnURL, "rtmp://") {
			// Translate RTMP URL to MediaMTX HTTP HLS & WebRTC WHEP endpoints for browser playback
			parts := strings.SplitN(strings.TrimPrefix(cdnURL, "rtmp://"), "/", 2)
			if len(parts) == 2 {
				streamPath := parts[1]
				cdnURL = fmt.Sprintf("http://localhost:8888/%s/index.m3u8", streamPath)
				whepURL = fmt.Sprintf("http://localhost:8889/%s/whep", streamPath)
			}
		} else if len(cdnURL) > 5 && cdnURL[:5] == "s3://" {
			objectKey := cdnURL[5:]
			parts := strings.SplitN(objectKey, "/", 2)
			if len(parts) == 2 {
				objectKey = parts[1]
				cdnURL = fmt.Sprintf("http://localhost:9000/streamforge/%s?t=%d", objectKey, time.Now().Unix())
			}
		}

		resp := gin.H{
			"playback_url":   cdnURL,
			"whep_url":       whepURL,
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
				"id":              video.User.ID,
				"username":        video.User.Username,
				"display_name":    video.User.DisplayName,
				"avatar_url":      video.User.AvatarURL,
				"followers_count": video.User.FollowersCount,
			},
		}

		jsonBytes, err := json.Marshal(resp)
		if err != nil {
			return nil, err
		}

		// Cache in Redis for 10 minutes
		if h.Redis != nil {
			_ = h.Redis.Set(context.Background(), cacheKey, jsonBytes, 10*time.Minute)
		}

		return jsonBytes, nil
	})

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
			return
		}
		if err.Error() == "video_not_ready" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Video is not ready for playback"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Data(http.StatusOK, "application/json; charset=utf-8", res.([]byte))
}

func (h *Handler) GetVideoStatus(c *gin.Context) {
	id := c.Param("id")
	var video models.Video

	if err := h.DB.Select("id", "status", "type", "title").First(&video, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	resp := gin.H{
		"status": video.Status,
		"type":   video.Type,
		"title":  video.Title,
	}

	// Bridge real-time Transcoder progress
	if video.Status == "Processing" {
		transcoderURL := os.Getenv("TRANSCODER_HEALTH_URL")
		if transcoderURL == "" {
			transcoderURL = "http://transcoder:8082/health"
		}
		client := http.Client{Timeout: 500 * time.Millisecond}
		res, err := client.Get(transcoderURL)
		if err != nil && transcoderURL != "http://localhost:8082/health" {
			// Fallback to localhost if running outside docker network
			res, err = client.Get("http://localhost:8082/health")
		}
		if err == nil {
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

	// Invalidate Redis playback cache
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("video:playback:%s", videoIDParam))
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

	// Invalidate cached user profile in Redis
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("user:profile:%d", userID))
		var u models.User
		if err := h.DB.Select("username").First(&u, userID).Error; err == nil {
			_ = h.Redis.Del(ctx, fmt.Sprintf("channel:public:%s", u.Username))
		}
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

	// Invalidate Redis playback cache on mutation
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("video:playback:%s", videoID))
	}

	c.JSON(http.StatusOK, gin.H{"message": "Video updated successfully"})
}

// RecordView uses Redis HyperLogLog for 24h client deduplication and Redis buffer for write-behind batching
func (h *Handler) RecordView(c *gin.Context) {
	idStr := c.Param("id")
	videoID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	ipAddress := c.ClientIP()

	var userIDPtr *uint
	var fingerprint string
	if userIDVal, exists := c.Get("userID"); exists {
		id := userIDVal.(uint)
		userIDPtr = &id
		fingerprint = fmt.Sprintf("u:%d", id)
	} else {
		fingerprint = fmt.Sprintf("ip:%s", ipAddress)
	}

	// 1. Production Path: Redis HyperLogLog deduplication + Write-Behind buffer
	if h.Redis != nil {
		ctx := c.Request.Context()
		today := time.Now().UTC().Format("2006-01-02")
		hllKey := fmt.Sprintf("views:hll:%d:%s", videoID, today)

		// PFADD returns 1 if new element was added, 0 if already observed today
		added, err := h.Redis.PFAdd(ctx, hllKey, fingerprint).Result()
		if err == nil {
			_ = h.Redis.Expire(ctx, hllKey, 48*time.Hour)
			if added == 0 {
				c.JSON(http.StatusOK, gin.H{
					"message": "View already recorded recently",
					"status":  "deduplicated",
				})
				return
			}
		}

		// Increment in-memory counter and register dirty video ID for batch flusher
		pipe := h.Redis.Pipeline()
		pipe.Incr(ctx, fmt.Sprintf("views:buffer:%d", videoID))
		pipe.SAdd(ctx, "views:dirty_videos", videoID)
		if _, err := pipe.Exec(ctx); err == nil {
			c.JSON(http.StatusOK, gin.H{
				"message": "View recorded successfully",
				"status":  "buffered",
			})
			return
		}
	}

	// 2. Graceful Fallback Path: Direct PostgreSQL transaction if Redis is offline
	cutoffTime := time.Now().Add(-24 * time.Hour)
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
		return tx.Model(&models.Video{}).Where("id = ?", videoID).UpdateColumn("views", gorm.Expr("views + ?", 1)).Error
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
