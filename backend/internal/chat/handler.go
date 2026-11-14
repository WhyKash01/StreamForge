package chat

import (
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"streamforge/internal/auth"
	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for streaming viewers
		return true
	},
}

type Handler struct {
	Hub   *Hub
	DB    *gorm.DB
	Redis *redis.Client
}

func NewHandler(hub *Hub, db *gorm.DB, rdb *redis.Client) *Handler {
	return &Handler{
		Hub:   hub,
		DB:    db,
		Redis: rdb,
	}
}

// ServeWS upgrades the HTTP connection to a WebSocket for real-time live chat and viewer tracking
func (h *Handler) ServeWS(c *gin.Context) {
	idStr := c.Param("id")
	videoID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid video ID"})
		return
	}

	// Browser WebSocket API cannot set custom Authorization headers directly;
	// accept JWT token via query param `?token=...` or Authorization cookie
	tokenString := c.Query("token")
	if tokenString == "" {
		if cookie, err := c.Cookie("access_token"); err == nil {
			tokenString = cookie
		}
	}

	var authenticatedUser *models.User
	if tokenString != "" {
		if userID, err := auth.ValidateAccessToken(tokenString); err == nil {
			var user models.User
			if err := h.DB.First(&user, userID).Error; err == nil {
				authenticatedUser = &user
			}
		}
	}

	// Generate a fallback guest handle for anonymous viewers
	guestName := fmt.Sprintf("Viewer_%d", rand.Intn(9000)+1000)

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &Client{
		hub:       h.Hub,
		videoID:   uint(videoID),
		conn:      conn,
		send:      make(chan []byte, 256),
		user:      authenticatedUser,
		guestName: guestName,
		lastSent:  time.Now().Add(-1 * time.Second),
	}

	h.Hub.register <- client

	// Start pump routines
	go client.writePump()
	go client.readPump()
}
