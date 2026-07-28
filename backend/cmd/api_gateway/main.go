package main

import (
	"fmt"
	"log"
	"os"

	"streamforge/internal/auth"
	"streamforge/internal/live"
	"streamforge/internal/metadata"
	"streamforge/internal/upload"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Environment Variables
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "http://localhost:9000"
	}
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}

	// Connect to Database
	dsn := "host=" + dbHost + " user=streamforge password=password dbname=streamforge port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run Auth Migrations
	if err := auth.Migrate(db); err != nil {
		log.Fatalf("Failed to migrate auth models: %v", err)
	}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{frontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Initialize Handlers
	authHandler := auth.NewHandler(db)

	// Auth Routes
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/logout", authHandler.Logout)
	}

	// Initialize Upload Handler with MinIO config
	s3Service := upload.NewS3Service(
		minioEndpoint,
		"us-east-1",
		"minioadmin",
		"minioadmin",
		"streamforge",
	)
	uploadHandler := upload.NewHandler(s3Service)

	// Upload Routes
	uploadGroup := r.Group("/api/upload")
	{
		uploadGroup.GET("/presigned", uploadHandler.HandlePresignedURL)
		uploadGroup.GET("/videos", uploadHandler.HandleListVideos)
	}

	// Metadata Routes
	metadataHandler := metadata.NewHandler(db)
	r.GET("/api/metadata/videos", metadataHandler.ListVideos)
	r.GET("/api/metadata/videos/:id/play", metadataHandler.GetVideoPlayback)

	// Webhooks
	webhookHandler := live.NewWebhookHandler(s3Service)
	r.Any("/api/webhooks/mediamtx", webhookHandler.HandleMediaMTXWebhook)

	// API Gateway routes
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "StreamForge API Gateway & Auth Service",
		})
	})

	fmt.Println("API Gateway & Auth running on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
