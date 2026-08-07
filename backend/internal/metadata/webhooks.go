package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"streamforge/internal/models"

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

	// Setup DLX
	if err := ch.ExchangeDeclare("transcode_dlx", "direct", true, false, false, false, nil); err != nil {
		return nil, fmt.Errorf("failed to declare dlx: %w", err)
	}
	dlq, err := ch.QueueDeclare("transcode_dlq", true, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to declare dlq: %w", err)
	}
	if err := ch.QueueBind(dlq.Name, "", "transcode_dlx", false, nil); err != nil {
		return nil, fmt.Errorf("failed to bind dlq: %w", err)
	}

	args := amqp.Table{"x-dead-letter-exchange": "transcode_dlx"}
	q, err := ch.QueueDeclare(
		"transcode_queue", // name
		true,              // durable
		false,             // delete when unused
		false,             // exclusive
		false,             // no-wait
		args,              // arguments
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

	// Extract stream key from path (e.g. "live/xyz" -> "xyz")
	segments := strings.Split(path, "/")
	streamKey := segments[len(segments)-1]

	var user models.User
	if err := h.DB.Where("stream_key = ?", streamKey).First(&user).Error; err != nil {
		if action == "publish" {
			log.Printf("Unauthorized stream attempt with key: %s", streamKey)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid Stream Key"})
			return
		}
	}

	streamURL := fmt.Sprintf("rtmp://localhost:1935/%s", path)

	switch action {
	case "publish":
		// Stream Started
		title := user.LiveTitle
		if title == "" {
			title = fmt.Sprintf("%s's Live Stream", user.DisplayName)
		}
		
		video := models.Video{
			Title:        title,
			Description:  user.LiveDescription,
			URL:          streamURL,
			Type:         "Live",
			Status:       "Live",
			UserID:       user.ID,
			ThumbnailURL: user.LiveThumbnailURL,
		}

		// Update or Create
		result := h.DB.Where(models.Video{URL: streamURL, Type: "Live"}).Assign(models.Video{
			Status:       "Live", 
			UserID:       user.ID,
			Title:        video.Title,
			Description:  video.Description,
			ThumbnailURL: video.ThumbnailURL,
		}).FirstOrCreate(&video)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
	case "publishDone":
		// Stream Ended (currently uploading to S3)
		h.DB.Model(&models.Video{}).Where("url = ? AND type = ?", streamURL, "Live").Update("status", "Uploading")
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

		objectKey, err := url.QueryUnescape(objectKeyRaw)
		if err != nil {
			objectKey = objectKeyRaw
		}

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

		// Extract user ID and timestamp prefix from objectKey (videos/{userID}/{timestamp}_{filename})
		parts := strings.Split(objectKey, "/")
		if len(parts) >= 3 {
			// Find the video by URL since it was pre-created in /api/upload/init
			var video models.Video
			if err := h.DB.Where("url = ?", vodURL).First(&video).Error; err != nil {
				// If not found, it wasn't initialized. Create a fallback or morph a Live stream.
				var userID uint
				if id, err := strconv.ParseUint(parts[1], 10, 32); err == nil {
					userID = uint(id)
				}
				
				isLiveRecording := strings.Contains(parts[len(parts)-1], "_syslive_")
				morphedLive := false

				if isLiveRecording {
					// Find the original Live video record that is currently "Uploading"
					var liveVideo models.Video
					if err := h.DB.Where("user_id = ? AND type = ?", userID, "Live").Order("created_at desc").First(&liveVideo).Error; err == nil {
						// Morph this existing Live record into the final VOD!
						title := liveVideo.Title
						if !strings.HasSuffix(title, " (VOD)") {
							title += " (VOD)"
						}
						
						h.DB.Model(&liveVideo).Updates(map[string]interface{}{
							"type":   "VOD",
							"url":    vodURL,
							"status": "Uploaded",
							"title":  title,
						})
						
						video = liveVideo
						morphedLive = true
					}
				}

				if !morphedLive {
					// Standard fallback creation if it wasn't a live stream (or live record was lost)
					video = models.Video{
						Title:        fmt.Sprintf("Uploaded VOD: %s", parts[len(parts)-1]),
						Description:  "VOD Upload",
						URL:          vodURL,
						Type:         "VOD",
						Status:       "Uploaded",
						UserID:       userID,
					}
					h.DB.Create(&video)
				}
			} else {
				// Found initialized video, update status
				h.DB.Model(&video).Update("status", "Uploaded")
			}

			// Push to RabbitMQ for transcoding
			err = h.pushToQueue(TranscodeJob{
				VideoID: video.ID,
				URL:     vodURL,
				Type:    "VOD",
			})
			if err != nil {
				log.Printf("Failed to push to RabbitMQ: %v", err)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}
