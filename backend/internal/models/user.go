package models

import (
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email            string  `gorm:"uniqueIndex;not null" json:"email"`
	Password         string  `gorm:"not null" json:"-"`
	Username         string  `gorm:"uniqueIndex;not null" json:"username"` // e.g. "john_doe"
	DisplayName      string  `json:"display_name"`
	AvatarURL        string  `json:"avatar_url"`
	Bio              string  `json:"bio"`
	StreamKey        string  `gorm:"uniqueIndex;not null" json:"stream_key"`
	LiveTitle        string  `json:"live_title"`
	LiveDescription  string  `json:"live_description"`
	LiveThumbnailURL string  `json:"live_thumbnail_url"`
	Videos           []Video `gorm:"foreignKey:UserID" json:"videos,omitempty"`
}
