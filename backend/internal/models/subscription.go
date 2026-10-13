package models

import (
	"time"
)

type Subscription struct {
	SubscriberID uint      `gorm:"primaryKey" json:"subscriber_id"`
	ChannelID    uint      `gorm:"primaryKey" json:"channel_id"`
	CreatedAt    time.Time `json:"created_at"`
}
