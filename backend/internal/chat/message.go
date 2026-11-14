package chat

import "time"

// MessageType defines the kind of event transmitted over the WebSocket
type MessageType string

const (
	TypeChat        MessageType = "chat"
	TypeViewerCount MessageType = "viewer_count"
	TypeHistory     MessageType = "history"
	TypeSystem      MessageType = "system"
	TypeError       MessageType = "error"
)

// Message is the structured payload exchanged over WebSocket
type Message struct {
	Type      MessageType `json:"type"`
	VideoID   uint        `json:"video_id"`
	UserID    *uint       `json:"user_id,omitempty"`
	Username  string      `json:"username"`
	AvatarURL string      `json:"avatar_url,omitempty"`
	Content   string      `json:"content,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	Count     int         `json:"count,omitempty"`   // Populated for TypeViewerCount
	History   []Message   `json:"history,omitempty"` // Populated for TypeHistory
}
