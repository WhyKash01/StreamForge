package videos

import (
	"fmt"
	"net/http"
	"strconv"

	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ToggleLikeVideo: Atomically toggles like for a video using PostgreSQL row-level locks
// and atomic SQL expressions inside a strict transaction to prevent race conditions.
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
	uid := userID.(uint)

	var video models.Video
	var finalLiked bool

	// Execute inside an isolated transaction with explicit row-level locking
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		// Acquire pessimistic row-level lock on the Video row (SELECT FOR UPDATE)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", videoID).First(&video).Error; err != nil {
			return err
		}

		var existingLike models.VideoLike
		alreadyLiked := tx.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingLike).Error == nil

		if alreadyLiked {
			// Already liked → remove like (toggle off)
			if err := tx.Unscoped().Delete(&existingLike).Error; err != nil {
				return err
			}
			if err := tx.Model(&video).UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)")).Error; err != nil {
				return err
			}
			finalLiked = false
		} else {
			// Not yet liked → remove any existing dislike first
			var existingDislike models.VideoDislike
			if tx.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingDislike).Error == nil {
				if err := tx.Unscoped().Delete(&existingDislike).Error; err != nil {
					return err
				}
				if err := tx.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("GREATEST(dislikes_count - 1, 0)")).Error; err != nil {
					return err
				}
			}

			// Insert new like record
			if err := tx.Create(&models.VideoLike{VideoID: uint(videoID), UserID: uid}).Error; err != nil {
				return err
			}
			if err := tx.Model(&video).UpdateColumn("likes_count", gorm.Expr("likes_count + 1")).Error; err != nil {
				return err
			}
			finalLiked = true
		}

		// Re-read fresh counts inside the same transaction
		return tx.Select("likes_count", "dislikes_count").First(&video, videoID).Error
	})

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update like status"})
		return
	}

	// Invalidate video playback cache in Redis so subsequent reads see the updated count
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("video:playback:%d", videoID))
	}

	c.JSON(http.StatusOK, gin.H{
		"liked":          finalLiked,
		"disliked":       false,
		"likes_count":    video.LikesCount,
		"dislikes_count": video.DislikesCount,
	})
}

// ToggleDislikeVideo: Atomically toggles dislike for a video using PostgreSQL row-level locks
// and atomic SQL expressions inside a strict transaction to prevent race conditions.
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
	uid := userID.(uint)

	var video models.Video
	var finalDisliked bool

	// Execute inside an isolated transaction with explicit row-level locking
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		// Acquire pessimistic row-level lock on the Video row (SELECT FOR UPDATE)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", videoID).First(&video).Error; err != nil {
			return err
		}

		var existingDislike models.VideoDislike
		alreadyDisliked := tx.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingDislike).Error == nil

		if alreadyDisliked {
			// Already disliked → remove dislike (toggle off)
			if err := tx.Unscoped().Delete(&existingDislike).Error; err != nil {
				return err
			}
			if err := tx.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("GREATEST(dislikes_count - 1, 0)")).Error; err != nil {
				return err
			}
			finalDisliked = false
		} else {
			// Not yet disliked → remove any existing like first
			var existingLike models.VideoLike
			if tx.Where("video_id = ? AND user_id = ?", videoID, uid).First(&existingLike).Error == nil {
				if err := tx.Unscoped().Delete(&existingLike).Error; err != nil {
					return err
				}
				if err := tx.Model(&video).UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)")).Error; err != nil {
					return err
				}
			}

			// Insert new dislike record
			if err := tx.Create(&models.VideoDislike{VideoID: uint(videoID), UserID: uid}).Error; err != nil {
				return err
			}
			if err := tx.Model(&video).UpdateColumn("dislikes_count", gorm.Expr("dislikes_count + 1")).Error; err != nil {
				return err
			}
			finalDisliked = true
		}

		// Re-read fresh counts inside the same transaction
		return tx.Select("likes_count", "dislikes_count").First(&video, videoID).Error
	})

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update dislike status"})
		return
	}

	// Invalidate video playback cache in Redis so subsequent reads see the updated count
	if h.Redis != nil {
		ctx := c.Request.Context()
		_ = h.Redis.Del(ctx, fmt.Sprintf("video:playback:%d", videoID))
	}

	c.JSON(http.StatusOK, gin.H{
		"liked":          false,
		"disliked":       finalDisliked,
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
