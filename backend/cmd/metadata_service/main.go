package main

import (
	"fmt"
	"os"

	"streamforge/internal/metadata"
	"streamforge/internal/models"
	"streamforge/internal/upload"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"streamforge/internal/logger"
	"streamforge/internal/middleware"
)

func main() {
	// Load environment variables
	_ = godotenv.Load("../.env")
	logger.InitLogger()
	defer logger.Sync()

	logger.Log.Info("Starting Metadata Service...")

	// Environment Variables
	dbHost := getEnvOrDefault("DB_HOST", "localhost")
	dbUser := getEnvOrDefault("DB_USER", "streamforge")
	dbPass := getEnvOrDefault("DB_PASSWORD", "password")
	dbName := getEnvOrDefault("DB_NAME", "streamforge")
	dbPort := getEnvOrDefault("DB_PORT", "5432")
	dbSSL := getEnvOrDefault("DB_SSLMODE", "disable")

	rabbitURL := getEnvOrDefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

	minioEndpoint := getEnvOrDefault("MINIO_ENDPOINT", "http://localhost:9000")
	minioRegion := getEnvOrDefault("MINIO_REGION", "us-east-1")
	minioAccessKey := getEnvOrDefault("MINIO_ACCESS_KEY", "minioadmin")
	minioSecretKey := getEnvOrDefault("MINIO_SECRET_KEY", "minioadmin")
	minioBucket := getEnvOrDefault("MINIO_BUCKET", "streamforge")

	// Initialize Database
	dbDSN := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		dbHost, dbUser, dbPass, dbName, dbPort, dbSSL)
	db, err := models.InitDB(dbDSN)
	if err != nil {
		logger.Log.Fatal("Failed to connect to database", zap.Error(err))
	}
	logger.Log.Info("Connected to PostgreSQL successfully")

	// Connect to Redis
	redisURL := getEnvOrDefault("REDIS_URL", "redis://localhost:6379/0")
	opt, err := redis.ParseURL(redisURL)
	var rdb *redis.Client
	if err == nil {
		rdb = redis.NewClient(opt)
	} else {
		logger.Log.Warn("Failed to parse REDIS_URL, running without cache", zap.Error(err))
	}

	r := gin.Default()
	r.Use(middleware.PrometheusMetrics())

	s3Service := upload.NewS3Service(
		minioEndpoint,
		minioRegion,
		minioAccessKey,
		minioSecretKey,
		minioBucket,
	)

	handler := metadata.NewHandler(db, s3Service, rdb)

	webhookHandler, err := metadata.NewWebhookHandler(db, rabbitURL)
	if err != nil {
		logger.Log.Fatal("Failed to initialize webhook handler", zap.Error(err))
	}

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

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

	logger.Log.Info("Metadata Service running on :8081")
	if err := r.Run(":8081"); err != nil {
		logger.Log.Fatal("Failed to start metadata service", zap.Error(err))
	}
}

func getEnvOrDefault(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
