package models

import (
	"gorm.io/gorm"
)

type Comment struct {
	gorm.Model
	Content    string    `json:"content"`
	UserID     uint      `gorm:"not null;index" json:"user_id"`
	User       User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	VideoID    uint      `gorm:"not null;index" json:"video_id"`
	Video      Video     `gorm:"foreignKey:VideoID" json:"-"`
	ParentID   *uint     `gorm:"index" json:"parent_id"` // null for top-level comments
	Parent     *Comment  `gorm:"foreignKey:ParentID" json:"-"`
	Replies    []Comment `gorm:"foreignKey:ParentID" json:"replies,omitempty"`
	LikesCount int       `gorm:"default:0" json:"likes_count"`
}

type CommentLike struct {
	gorm.Model
	CommentID uint `gorm:"uniqueIndex:idx_user_comment;not null" json:"comment_id"`
	UserID    uint `gorm:"uniqueIndex:idx_user_comment;not null" json:"user_id"`
}
