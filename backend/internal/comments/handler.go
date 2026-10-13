package comments

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

type CreateCommentRequest struct {
	Content  string `json:"content" binding:"required"`
	ParentID *uint  `json:"parent_id"`
}

func (h *Handler) CreateComment(c *gin.Context) {
	videoIDStr := c.Param("id")
	videoID, err := strconv.ParseUint(videoIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	// Verify video exists
	var video models.Video
	if err := h.DB.First(&video, videoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Video not found"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// If this is a reply, verify parent comment exists and belongs to same video
	if req.ParentID != nil {
		var parent models.Comment
		if err := h.DB.First(&parent, *req.ParentID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment not found"})
			return
		}
		if parent.VideoID != uint(videoID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment does not belong to this video"})
			return
		}
	}

	comment := models.Comment{
		Content:  req.Content,
		UserID:   userID.(uint),
		VideoID:  uint(videoID),
		ParentID: req.ParentID,
	}

	if err := h.DB.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment"})
		return
	}

	// Fetch user details to return the fully populated comment
	h.DB.Preload("User").First(&comment, comment.ID)

	c.JSON(http.StatusCreated, comment)
}

func (h *Handler) GetCommentsByVideo(c *gin.Context) {
	videoIDStr := c.Param("id")
	videoID, err := strconv.ParseUint(videoIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	var comments []models.Comment
	if err := h.DB.
		Preload("User").
		Preload("Replies", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Preload("User")
		}).
		Where("video_id = ? AND parent_id IS NULL", videoID).
		Order("created_at DESC").
		Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"comments": comments})
}

func (h *Handler) DeleteComment(c *gin.Context) {
	commentIDStr := c.Param("id")
	commentID, err := strconv.ParseUint(commentIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	uid := userID.(uint)

	// Load comment with its video to check ownership
	var comment models.Comment
	if err := h.DB.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Load the video separately for owner check
	var video models.Video
	if err := h.DB.First(&video, comment.VideoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Associated video not found"})
		return
	}

	// Permission: comment author OR video owner can delete
	isCommentOwner := comment.UserID == uid
	isVideoOwner := video.UserID == uid

	if !isCommentOwner && !isVideoOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this comment"})
		return
	}

	// Delete all replies first, then the comment itself
	h.DB.Where("parent_id = ?", commentID).Delete(&models.Comment{})
	h.DB.Delete(&comment)

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

func (h *Handler) ToggleLikeComment(c *gin.Context) {
	commentIDStr := c.Param("id")
	commentID, err := strconv.ParseUint(commentIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var comment models.Comment
	if err := h.DB.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	uid := userID.(uint)

	var like models.CommentLike
	alreadyLiked := h.DB.Where("comment_id = ? AND user_id = ?", commentID, uid).First(&like).Error == nil

	if alreadyLiked {
		h.DB.Unscoped().Delete(&like)
		h.DB.Model(&comment).UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)"))
	} else {
		h.DB.Create(&models.CommentLike{CommentID: uint(commentID), UserID: uid})
		h.DB.Model(&comment).UpdateColumn("likes_count", gorm.Expr("likes_count + 1"))
	}

	// Re-read fresh count from DB
	h.DB.First(&comment, commentID)
	c.JSON(http.StatusOK, gin.H{"liked": !alreadyLiked, "likes_count": comment.LikesCount})
}
