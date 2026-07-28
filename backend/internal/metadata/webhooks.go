package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"
)

type WebhookHandler struct {
	DB    *gorm.DB
	AMQP  *amqp.Connection
	Chan  *amqp.Channel
	Queue amqp.Queue
}

func NewWebhookHandler(db *gorm.DB, rabbitURL string) (*WebhookHandler, error) {
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	q, err := ch.QueueDeclare(
		"transcode_queue", // name
		true,              // durable
		false,             // delete when unused
		false,             // exclusive
		false,             // no-wait
		nil,               // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare a queue: %w", err)
	}

	return &WebhookHandler{
		DB:    db,
		AMQP:  conn,
		Chan:  ch,
		Queue: q,
	}, nil
}

type TranscodeJob struct {
	VideoID uint   `json:"video_id"`
	URL     string `json:"url"`
	Type    string `json:"type"` // "Live" or "VOD"
}

func (h *WebhookHandler) pushToQueue(job TranscodeJob) error {
	body, err := json.Marshal(job)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return h.Chan.PublishWithContext(ctx,
		"",           // exchange
		h.Queue.Name, // routing key
		false,        // mandatory
		false,        // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		})
}

type MediaMTXWebhookPayload struct {
	Action string `json:"action" form:"action"`
	Path   string `json:"path" form:"path"`
	Query  string `json:"query" form:"query"`
}

// HandleLiveWebhook handles start/stop of live streams from MediaMTX
func (h *WebhookHandler) HandleLiveWebhook(c *gin.Context) {
	action := c.Query("action")
	path := c.Query("path")

	if action == "" {
		var payload MediaMTXWebhookPayload
		if err := c.ShouldBind(&payload); err == nil {
			action = payload.Action
			path = payload.Path
		}
	}

	log.Printf("Received Live Webhook: Action=%s, Path=%s", action, path)

	streamURL := fmt.Sprintf("rtmp://localhost:1935/%s", path)

	switch action {
	case "publish":
		// Stream Started
		video := Video{
			Title:       fmt.Sprintf("Live Stream: %s", path),
			Description: "Live Stream Recording",
			URL:         streamURL,
			Type:        "Live",
			Status:      "Live",
		}

		// Update or Create
		result := h.DB.Where(Video{URL: streamURL, Type: "Live"}).Assign(Video{Status: "Live"}).FirstOrCreate(&video)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
	case "publishDone":
		// Stream Ended
		h.DB.Model(&Video{}).Where("url = ? AND type = ?", streamURL, "Live").Update("status", "Offline")
	}

	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

// HandleVODWebhook handles MinIO S3 ObjectCreated events
func (h *WebhookHandler) HandleVODWebhook(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	log.Printf("Received VOD Webhook Event")

	// Parse MinIO Webhook Event (simplistic approach for S3 events)
	records, ok := payload["Records"].([]interface{})
	if !ok || len(records) == 0 {
		c.JSON(http.StatusOK, gin.H{"status": "no records"})
		return
	}

	for _, recordInter := range records {
		record := recordInter.(map[string]interface{})
		s3Data, ok := record["s3"].(map[string]interface{})
		if !ok {
			continue
		}
		bucketData := s3Data["bucket"].(map[string]interface{})
		objectData := s3Data["object"].(map[string]interface{})

		bucketName := bucketData["name"].(string)
		objectKeyRaw := objectData["key"].(string)
		
		// S3 events URL-encode the object key (e.g. videos%2F123.mp4 -> videos/123.mp4)
		objectKey, err := url.QueryUnescape(objectKeyRaw)
		if err != nil {
			objectKey = objectKeyRaw // Fallback to raw if decode fails
		}

		// Prevent infinite loops! Only process video files inside the videos/ folder.
		// Ignore any uploads to the hls/ folder or .ts/.m3u8 chunks created by the transcoder.
		if !strings.HasPrefix(objectKey, "videos/") {
			log.Printf("Ignoring non-video folder upload event: %s", objectKey)
			continue
		}

		lowerKey := strings.ToLower(objectKey)
		if !strings.HasSuffix(lowerKey, ".mp4") && 
		   !strings.HasSuffix(lowerKey, ".mkv") && 
		   !strings.HasSuffix(lowerKey, ".mov") && 
		   !strings.HasSuffix(lowerKey, ".avi") && 
		   !strings.HasSuffix(lowerKey, ".webm") {
			log.Printf("Ignoring non-video upload event: %s", objectKey)
			continue
		}

		vodURL := fmt.Sprintf("s3://%s/%s", bucketName, objectKey)

		video := Video{
			Title:       fmt.Sprintf("Uploaded VOD: %s", objectKey),
			Description: "VOD Upload",
			URL:         vodURL,
			Type:        "VOD",
			Status:      "Uploaded",
		}

		if err := h.DB.Create(&video).Error; err != nil {
			log.Printf("DB error creating VOD: %v", err)
			continue
		}

		// Push to RabbitMQ
		err = h.pushToQueue(TranscodeJob{
			VideoID: video.ID,
			URL:     vodURL,
			Type:    "VOD",
		})
		if err != nil {
			log.Printf("Failed to push to RabbitMQ: %v", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}
