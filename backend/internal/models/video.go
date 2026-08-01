package models

import (
	"gorm.io/gorm"
)

type Video struct {
	gorm.Model
	Title        string `json:"title"`
	Description  string `json:"description"`
	URL          string `json:"url"` // Used for VOD URL or Live Stream URL
	Type         string `json:"type"` // "VOD" or "Live"
	Status       string `json:"status"` // "Uploaded", "Live", "Offline", "Processing", "Done"
	ThumbnailURL string `json:"thumbnail_url"`
	Views        int64  `json:"views"`
	
	UserID       uint   `gorm:"not null;index" json:"user_id"`
	User         User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
