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
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WebhookHandler struct {
	DB    *gorm.DB
	Redis *redis.Client
	AMQP  *amqp.Connection
	Chan  *amqp.Channel
	Queue amqp.Queue
}

func NewWebhookHandler(db *gorm.DB, rabbitURL string, rdb *redis.Client) (*WebhookHandler, error) {
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
		Redis: rdb,
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
		
		var video models.Video
		err := h.DB.Transaction(func(tx *gorm.DB) error {
			return tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(models.Video{URL: streamURL, Type: "Live"}).Assign(models.Video{
				Status:       "Live", 
				UserID:       user.ID,
				Title:        title,
				Description:  user.LiveDescription,
				ThumbnailURL: user.LiveThumbnailURL,
				Category:     user.LiveCategory,
				Tags:         user.LiveTags,
			}).FirstOrCreate(&video).Error
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}

		// Enqueue the live stream for real-time HLS transcoding outside the transaction
		err = h.pushToQueue(TranscodeJob{
			VideoID: video.ID,
			URL:     streamURL,
			Type:    "Live",
		})
		if err != nil {
			log.Printf("Failed to push Live TranscodeJob to RabbitMQ: %v", err)
		}
	case "publishDone":
		// Stream Ended (currently uploading recording to S3)
		var targetVid models.Video
		h.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("url = ? AND type = ?", streamURL, "Live").
				Where("status IN ?", []string{"Live", "Processing"}).
				First(&targetVid).Error; err == nil {
				return tx.Model(&targetVid).Update("status", "Uploading").Error
			}
			return nil
		})

		// Invalidate cached live stream playback & feed in Redis
		if h.Redis != nil {
			if targetVid.ID > 0 {
				_ = h.Redis.Del(context.Background(), fmt.Sprintf("video:playback:%d", targetVid.ID))
			}
			_ = h.Redis.Del(context.Background(), "videos:feed")
		}
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
			var video models.Video
			var shouldPush bool

			err = h.DB.Transaction(func(tx *gorm.DB) error {
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("url = ?", vodURL).First(&video).Error; err != nil {
					// If not found, it wasn't initialized. Create a fallback or morph a Live stream.
					var userID uint
					if id, err := strconv.ParseUint(parts[1], 10, 32); err == nil {
						userID = uint(id)
					}
					
					isLiveRecording := strings.Contains(parts[len(parts)-1], "_syslive_")
					morphedLive := false

					if isLiveRecording {
						// Find the original Live video record that is currently "Uploading", "Live", or "Processing"
						var liveVideo models.Video
						if err := tx.Where("user_id = ? AND (type = 'Live' OR status IN ('Uploading', 'Live', 'Processing'))", userID).
							Order("created_at desc").First(&liveVideo).Error; err == nil {
							// Morph this existing Live record into the final VOD!
							title := liveVideo.Title
							if !strings.HasSuffix(title, " (VOD)") {
								title += " (VOD)"
							}
							
							tx.Model(&liveVideo).Updates(map[string]interface{}{
								"url":    vodURL,
								"status": "Uploaded",
								"title":  title,
								"type":   "VOD",
							})
							
							liveVideo.Type = "VOD"
							liveVideo.Status = "Uploaded"
							liveVideo.URL = vodURL
							liveVideo.Title = title
							video = liveVideo
							morphedLive = true

							// Invalidate Redis cache so stale Live playback details are evicted
							if h.Redis != nil {
								_ = h.Redis.Del(context.Background(), fmt.Sprintf("video:playback:%d", liveVideo.ID))
								_ = h.Redis.Del(context.Background(), "videos:feed")
							}
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
						tx.Create(&video)
					}
					shouldPush = true
					return nil
				} else {
					// Found initialized video, enforce state guard
					if video.Status == "Uploading" || video.Status == "Live" || video.Status == "" || video.Status == "Pending" {
						if err := tx.Model(&video).Update("status", "Uploaded").Error; err != nil {
							return err
						}
						shouldPush = true
					} else {
						log.Printf("Ignoring VOD webhook for %s due to invalid state: %s", video.URL, video.Status)
					}
					return nil
				}
			})

			if err != nil {
				log.Printf("Failed VOD transaction: %v", err)
				continue
			}

			if shouldPush {
				// Push to RabbitMQ for transcoding outside of transaction
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
	}

	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}
