package chat

import (
	"encoding/json"
	"testing"
	"time"
)

func TestChatMessageSerialization(t *testing.T) {
	uid := uint(7)
	msg := Message{
		Type:      TypeChat,
		VideoID:   101,
		UserID:    &uid,
		Username:  "alex_streamer",
		AvatarURL: "https://example.com/avatar.jpg",
		Content:   "Hello chat! Welcome to StreamForge!",
		CreatedAt: time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal Message: %v", err)
	}

	var parsed Message
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal Message: %v", err)
	}

	if parsed.Type != TypeChat {
		t.Errorf("Expected Type %s, got %s", TypeChat, parsed.Type)
	}
	if parsed.VideoID != 101 {
		t.Errorf("Expected VideoID 101, got %d", parsed.VideoID)
	}
	if parsed.Username != "alex_streamer" {
		t.Errorf("Expected Username alex_streamer, got %s", parsed.Username)
	}
	if parsed.Content != "Hello chat! Welcome to StreamForge!" {
		t.Errorf("Expected Content match, got %s", parsed.Content)
	}
}

func TestViewerCountMessageSerialization(t *testing.T) {
	msg := Message{
		Type:      TypeViewerCount,
		VideoID:   202,
		Count:     1540,
		CreatedAt: time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal viewer count message: %v", err)
	}

	var parsed Message
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal viewer count message: %v", err)
	}

	if parsed.Type != TypeViewerCount {
		t.Errorf("Expected Type %s, got %s", TypeViewerCount, parsed.Type)
	}
	if parsed.Count != 1540 {
		t.Errorf("Expected Count 1540, got %d", parsed.Count)
	}
}
