package models

import (
	"gorm.io/gorm"
)

type VideoLike struct {
	gorm.Model
	VideoID uint `gorm:"uniqueIndex:idx_user_video_like;not null" json:"video_id"`
	UserID  uint `gorm:"uniqueIndex:idx_user_video_like;not null" json:"user_id"`
}

type VideoDislike struct {
	gorm.Model
	VideoID uint `gorm:"uniqueIndex:idx_user_video_dislike;not null" json:"video_id"`
	UserID  uint `gorm:"uniqueIndex:idx_user_video_dislike;not null" json:"user_id"`
}
