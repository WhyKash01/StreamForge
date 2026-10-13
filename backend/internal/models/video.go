package models

import (
	"gorm.io/gorm"
)

type Video struct {
	gorm.Model
	Title        string `json:"title"`
	Description  string `json:"description"`
	URL          string `gorm:"index:idx_url_type,priority:1" json:"url"` // Used for VOD URL or Live Stream URL
	Type         string `gorm:"index:idx_url_type,priority:2" json:"type"` // "VOD" or "Live"
	Status       string `json:"status"` // "Uploaded", "Live", "Offline", "Processing", "Done"
	Visibility   string `gorm:"default:'public'" json:"visibility"` // "public", "private", "unlisted"
	ThumbnailURL string `json:"thumbnail_url"`
	Duration     int    `json:"duration"` // Duration in seconds
	Category     string `json:"category"`
	Tags         string `json:"tags"` // Comma-separated list of tags
	Views        int64  `json:"views"`
	LikesCount   int    `gorm:"default:0" json:"likes_count"`
	DislikesCount int   `gorm:"default:0" json:"dislikes_count"`
	
	UserID       uint   `gorm:"not null;index" json:"user_id"`
	User         User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
