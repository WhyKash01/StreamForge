package main

import (
	"fmt"
	"log"
	"os"

	"streamforge/internal/metadata"
	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
)

func main() {
	// Environment Variables
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://guest:guest@localhost:5672/"
	}

	// Initialize Database
	dbDSN := "host=" + dbHost + " user=streamforge password=password dbname=streamforge port=5432 sslmode=disable"
	db, err := models.InitDB(dbDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	fmt.Println("Connected to PostgreSQL successfully")

	r := gin.Default()
	handler := metadata.NewHandler(db)

	webhookHandler, err := metadata.NewWebhookHandler(db, rabbitURL)
	if err != nil {
		log.Fatalf("Failed to initialize webhook handler: %v", err)
	}

	r.GET("/api/metadata/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Example routes
	r.GET("/api/metadata/videos", handler.ListVideos)
	r.GET("/api/metadata/videos/:id/play", handler.GetVideoPlayback)
	r.GET("/api/channel/:username", handler.GetChannel)
	r.GET("/api/users/:user_id/videos", handler.GetUserVideos)

	// Webhooks
	r.Any("/api/v1/webhooks/live", webhookHandler.HandleLiveWebhook)
	r.POST("/api/v1/webhooks/vod", webhookHandler.HandleVODWebhook)

	fmt.Println("Metadata Service running on :8081")
	if err := r.Run(":8081"); err != nil {
		log.Fatal(err)
	}
}
