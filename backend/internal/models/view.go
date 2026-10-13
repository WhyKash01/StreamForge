package models

import (
	"time"
)

type VideoView struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	VideoID   uint      `gorm:"not null;index" json:"video_id"`
	UserID    *uint     `gorm:"index" json:"user_id"` // Nullable if not logged in
	IPAddress string    `gorm:"not null;index" json:"ip_address"`
	ViewedAt  time.Time `json:"viewed_at"`
}
