package chat

import (
	"encoding/json"
	"strings"
	"time"

	"streamforge/internal/logger"
	"streamforge/internal/models"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer (4 KB).
	maxMessageSize = 4096

	// Rate limiting interval per client (minimum 400ms between messages).
	minMessageInterval = 400 * time.Millisecond
)

type Client struct {
	hub       *Hub
	videoID   uint
	conn      *websocket.Conn
	send      chan []byte
	user      *models.User
	guestName string
	lastSent  time.Time
}

func (c *Client) getUsername() string {
	if c.user != nil {
		if c.user.DisplayName != "" {
			return c.user.DisplayName
		}
		return c.user.Username
	}
	return c.guestName
}

func (c *Client) getAvatarURL() string {
	if c.user != nil {
		return c.user.AvatarURL
	}
	return ""
}

func (c *Client) getUserID() *uint {
	if c.user != nil {
		return &c.user.ID
	}
	return nil
}

// readPump pumps messages from the websocket connection to the room hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, rawMsg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Log.Warn("WebSocket closed unexpectedly", zap.Error(err))
			}
			break
		}

		var incoming struct {
			Content string `json:"content"`
		}
		if err := json.Unmarshal(rawMsg, &incoming); err != nil {
			continue
		}

		content := strings.TrimSpace(incoming.Content)
		if content == "" {
			continue
		}

		// Enforce max length of 500 characters
		if len(content) > 500 {
			content = content[:500]
		}

		// Enforce client-side rate limit
		now := time.Now()
		if now.Sub(c.lastSent) < minMessageInterval {
			errMsg, _ := json.Marshal(Message{
				Type:      TypeError,
				VideoID:   c.videoID,
				Content:   "You are sending messages too quickly. Please slow down.",
				CreatedAt: now,
			})
			select {
			case c.send <- errMsg:
			default:
			}
			continue
		}
		c.lastSent = now

		msg := Message{
			Type:      TypeChat,
			VideoID:   c.videoID,
			UserID:    c.getUserID(),
			Username:  c.getUsername(),
			AvatarURL: c.getAvatarURL(),
			Content:   content,
			CreatedAt: now,
		}

		c.hub.broadcast <- msg
	}
}

// writePump pumps messages from the hub to the websocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Add queued chat messages to the current websocket frame
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
