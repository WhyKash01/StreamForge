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
	BannerURL        string  `json:"banner_url"`
	Bio              string  `json:"bio"`
	IsVerified       bool    `gorm:"default:false" json:"is_verified"`
	FollowersCount   int     `gorm:"default:0" json:"followers_count"`
	FollowingCount   int     `gorm:"default:0" json:"following_count"`
	StreamKey        string  `gorm:"uniqueIndex;not null" json:"stream_key"`
	LiveTitle        string  `json:"live_title"`
	LiveDescription  string  `json:"live_description"`
	LiveThumbnailURL string  `json:"live_thumbnail_url"`
	LiveCategory     string  `json:"live_category"`
	LiveTags         string  `json:"live_tags"`
	Videos           []Video `gorm:"foreignKey:UserID" json:"videos,omitempty"`
}
