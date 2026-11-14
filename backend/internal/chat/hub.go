package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"streamforge/internal/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type Hub struct {
	rdb        *redis.Client
	mu         sync.RWMutex
	rooms      map[uint]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan Message
	stopChan   chan struct{}
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		rdb:        rdb,
		rooms:      make(map[uint]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan Message, 256),
		stopChan:   make(chan struct{}),
	}
}

func (h *Hub) Run() {
	// Start Redis Pub/Sub listener if Redis is connected
	if h.rdb != nil {
		go h.listenRedisPubSub()
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.addClient(client)

		case client := <-h.unregister:
			h.removeClient(client)

		case msg := <-h.broadcast:
			h.handleBroadcast(msg)

		case <-ticker.C:
			h.broadcastAllViewerCounts()

		case <-h.stopChan:
			return
		}
	}
}

func (h *Hub) Stop() {
	close(h.stopChan)
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	if _, ok := h.rooms[c.videoID]; !ok {
		h.rooms[c.videoID] = make(map[*Client]bool)
	}
	h.rooms[c.videoID][c] = true
	roomSize := len(h.rooms[c.videoID])
	h.mu.Unlock()

	logger.Log.Info("Client joined live chat",
		zap.Uint("video_id", c.videoID),
		zap.String("username", c.getUsername()),
		zap.Int("room_size", roomSize),
	)

	// Send recent message history to the newly connected client
	go h.sendRecentHistory(c)

	// Broadcast updated viewer count to room
	h.broadcastViewerCount(c.videoID, roomSize)
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	if clients, ok := h.rooms[c.videoID]; ok {
		if _, exists := clients[c]; exists {
			delete(clients, c)
			close(c.send)
			if len(clients) == 0 {
				delete(h.rooms, c.videoID)
			}
		}
	}
	roomSize := 0
	if clients, ok := h.rooms[c.videoID]; ok {
		roomSize = len(clients)
	}
	h.mu.Unlock()

	h.broadcastViewerCount(c.videoID, roomSize)
}

func (h *Hub) handleBroadcast(msg Message) {
	jsonBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	// 1. If Redis is available, publish to Redis Pub/Sub channel for multi-pod broadcast
	if h.rdb != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		channel := fmt.Sprintf("chat:pubsub:%d", msg.VideoID)
		historyKey := fmt.Sprintf("chat:history:%d", msg.VideoID)

		// Publish to Pub/Sub
		_ = h.rdb.Publish(ctx, channel, jsonBytes).Err()

		// Store in rolling history (keep latest 50 messages)
		pipe := h.rdb.Pipeline()
		pipe.LPush(ctx, historyKey, jsonBytes)
		pipe.LTrim(ctx, historyKey, 0, 49)
		pipe.Expire(ctx, historyKey, 4*time.Hour)
		_, _ = pipe.Exec(ctx)
		return
	}

	// 2. Fallback: local in-memory broadcast if Redis is nil
	h.broadcastLocal(msg.VideoID, jsonBytes)
}

// listenRedisPubSub subscribes to all live chat rooms via Redis pattern
func (h *Hub) listenRedisPubSub() {
	ctx := context.Background()
	pubsub := h.rdb.PSubscribe(ctx, "chat:pubsub:*")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for redisMsg := range ch {
		// Extract videoID from channel "chat:pubsub:{video_id}"
		parts := strings.Split(redisMsg.Channel, ":")
		if len(parts) != 3 {
			continue
		}
		vid, err := strconv.ParseUint(parts[2], 10, 32)
		if err != nil {
			continue
		}

		h.broadcastLocal(uint(vid), []byte(redisMsg.Payload))
	}
}

// broadcastLocal sends raw payload bytes to all local WebSocket clients in the specified room
func (h *Hub) broadcastLocal(videoID uint, payload []byte) {
	h.mu.RLock()
	clients, ok := h.rooms[videoID]
	if !ok || len(clients) == 0 {
		h.mu.RUnlock()
		return
	}

	for client := range clients {
		select {
		case client.send <- payload:
		default:
			// If buffer is full, close slow client to protect the hub
			close(client.send)
			delete(clients, client)
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) broadcastViewerCount(videoID uint, count int) {
	msg := Message{
		Type:      TypeViewerCount,
		VideoID:   videoID,
		Count:     count,
		CreatedAt: time.Now(),
	}
	jsonBytes, _ := json.Marshal(msg)
	h.broadcastLocal(videoID, jsonBytes)
}

func (h *Hub) broadcastAllViewerCounts() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for videoID, clients := range h.rooms {
		msg := Message{
			Type:      TypeViewerCount,
			VideoID:   videoID,
			Count:     len(clients),
			CreatedAt: time.Now(),
		}
		if jsonBytes, err := json.Marshal(msg); err == nil {
			for client := range clients {
				select {
				case client.send <- jsonBytes:
				default:
				}
			}
		}
	}
}

// sendRecentHistory sends the cached recent messages from Redis to a newly connected client
func (h *Hub) sendRecentHistory(c *Client) {
	if h.rdb == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	historyKey := fmt.Sprintf("chat:history:%d", c.videoID)
	// LRange retrieves from newest to oldest
	rawHistory, err := h.rdb.LRange(ctx, historyKey, 0, 30).Result()
	if err != nil || len(rawHistory) == 0 {
		return
	}

	var messages []Message
	// Reverse list so client receives them chronologically (oldest to newest)
	for i := len(rawHistory) - 1; i >= 0; i-- {
		var m Message
		if err := json.Unmarshal([]byte(rawHistory[i]), &m); err == nil {
			messages = append(messages, m)
		}
	}

	payload := Message{
		Type:      TypeHistory,
		VideoID:   c.videoID,
		History:   messages,
		CreatedAt: time.Now(),
	}

	if jsonBytes, err := json.Marshal(payload); err == nil {
		select {
		case c.send <- jsonBytes:
		default:
		}
	}
}
