package videos

import (
	"net/http"
	"strconv"
	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ToggleLikeVideo: If already liked, unlikes. If disliked, removes dislike and adds like. Otherwise adds like.
func (h *Handler) ToggleLikeVideo(c *gin.Context) {
	videoIDStr := c.Param("id")
	videoID, err := strconv.ParseUint(videoIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var video models.Video
	if err := h.DB.First(&video, videoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	uid := userID.(uint)

	var existingLike models.VideoLike
	alreadyLiked := h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingLike).Error == nil

	if alreadyLiked {
		// Already liked → remove like (toggle off)
		h.DB.Unscoped().Delete(&existingLike)
		h.DB.Model(&video).UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)"))
	} else {
		// Not yet liked → remove any existing dislike first, then add like
		var existingDislike models.VideoDislike
		if h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingDislike).Error == nil {
			h.DB.Unscoped().Delete(&existingDislike)
			h.DB.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("GREATEST(dislikes_count - 1, 0)"))
		}
		h.DB.Create(&models.VideoLike{VideoID: uint(videoID), UserID: uid})
		h.DB.Model(&video).UpdateColumn("likes_count", gorm.Expr("likes_count + 1"))
	}

	// Re-read fresh counts from DB
	h.DB.First(&video, videoID)
	c.JSON(http.StatusOK, gin.H{
		"liked":          !alreadyLiked,
		"disliked":       false,
		"likes_count":    video.LikesCount,
		"dislikes_count": video.DislikesCount,
	})
}

// ToggleDislikeVideo: If already disliked, removes dislike. If liked, removes like and adds dislike. Otherwise adds dislike.
func (h *Handler) ToggleDislikeVideo(c *gin.Context) {
	videoIDStr := c.Param("id")
	videoID, err := strconv.ParseUint(videoIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var video models.Video
	if err := h.DB.First(&video, videoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	uid := userID.(uint)

	var existingDislike models.VideoDislike
	alreadyDisliked := h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingDislike).Error == nil

	if alreadyDisliked {
		// Already disliked → remove dislike (toggle off)
		h.DB.Unscoped().Delete(&existingDislike)
		h.DB.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("GREATEST(dislikes_count - 1, 0)"))
	} else {
		// Not yet disliked → remove any existing like first, then add dislike
		var existingLike models.VideoLike
		if h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingLike).Error == nil {
			h.DB.Unscoped().Delete(&existingLike)
			h.DB.Model(&video).UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)"))
		}
		h.DB.Create(&models.VideoDislike{VideoID: uint(videoID), UserID: uid})
		h.DB.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("dislikes_count + 1"))
	}

	// Re-read fresh counts from DB
	h.DB.First(&video, videoID)
	c.JSON(http.StatusOK, gin.H{
		"liked":          false,
		"disliked":       !alreadyDisliked,
		"likes_count":    video.LikesCount,
		"dislikes_count": video.DislikesCount,
	})
}

// GetVideoLikeStatus: Returns both like and dislike status for the current user
func (h *Handler) GetVideoLikeStatus(c *gin.Context) {
	videoIDStr := c.Param("id")
	videoID, err := strconv.ParseUint(videoIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusOK, gin.H{"liked": false, "disliked": false})
		return
	}

	uid := userID.(uint)

	var like models.VideoLike
	liked := h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&like).Error == nil

	var dislike models.VideoDislike
	disliked := h.DB.Where("video_id = ? AND user_id = ?", videoID, uid).First(&dislike).Error == nil

	c.JSON(http.StatusOK, gin.H{"liked": liked, "disliked": disliked})
}
