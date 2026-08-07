package main

import (
	"fmt"
	"os"
	"time"

	"streamforge/internal/auth"
	"streamforge/internal/live"
	"streamforge/internal/metadata"
	"streamforge/internal/middleware"
	"streamforge/internal/models"
	"streamforge/internal/upload"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"streamforge/internal/logger"
)

func main() {
	godotenv.Load("../.env")
	logger.InitLogger()
	defer logger.Sync()

	logger.Log.Info("Starting API Gateway...")

	// Environment Variables
	frontendURL := getEnvOrDefault("FRONTEND_URL", "http://localhost:5173")

	// Connect to Database
	dbHost := getEnvOrDefault("DB_HOST", "localhost")
	dbUser := getEnvOrDefault("DB_USER", "streamforge")
	dbPass := getEnvOrDefault("DB_PASSWORD", "password")
	dbName := getEnvOrDefault("DB_NAME", "streamforge")
	dbPort := getEnvOrDefault("DB_PORT", "5432")
	dbSSL := getEnvOrDefault("DB_SSLMODE", "disable")

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		dbHost, dbUser, dbPass, dbName, dbPort, dbSSL)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		logger.Log.Fatal("Failed to connect to database", zap.Error(err))
	}

	// Run Migrations
	if err := db.AutoMigrate(&models.User{}, &models.Video{}); err != nil {
		logger.Log.Fatal("Failed to migrate models", zap.Error(err))
	}

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

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{frontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Middlewares
	authMiddleware := middleware.RequireAuth(db)

	// Initialize Handlers
	authHandler := auth.NewHandler(db)

	// Observability Routes
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Auth Routes (Rate Limited to 5 requests per minute)
	authGroup := r.Group("/api/auth")
	authGroup.Use(middleware.RateLimit(rdb, 5, time.Minute))
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/logout", authHandler.Logout)
	}

	// Initialize Upload Handler with MinIO config
	minioEndpoint := getEnvOrDefault("MINIO_ENDPOINT", "http://localhost:9000")
	minioRegion := getEnvOrDefault("MINIO_REGION", "us-east-1")
	minioAccessKey := getEnvOrDefault("MINIO_ACCESS_KEY", "minioadmin")
	minioSecretKey := getEnvOrDefault("MINIO_SECRET_KEY", "minioadmin")
	minioBucket := getEnvOrDefault("MINIO_BUCKET", "streamforge")

	s3Service := upload.NewS3Service(
		minioEndpoint,
		minioRegion,
		minioAccessKey,
		minioSecretKey,
		minioBucket,
	)
	uploadHandler := upload.NewHandler(s3Service, db)

	// Upload Routes
	uploadGroup := r.Group("/api/upload")
	{
		uploadGroup.POST("/init", authMiddleware, uploadHandler.HandleInitUpload)
		uploadGroup.GET("/presigned", authMiddleware, uploadHandler.HandlePresignedURL)
		uploadGroup.GET("/videos", uploadHandler.HandleListVideos)
	}

	// Live Routes
	r.POST("/api/live/settings", authMiddleware, uploadHandler.HandleLiveSettings)
	r.GET("/api/live/status", authMiddleware, uploadHandler.GetLiveStatus)

	// Metadata Routes
	metadataHandler := metadata.NewHandler(db, s3Service, rdb)
	r.GET("/api/metadata/videos", metadataHandler.ListVideos)
	r.GET("/api/metadata/videos/:id/play", metadataHandler.GetVideoPlayback)
	r.GET("/api/metadata/videos/:id/status", authMiddleware, metadataHandler.GetVideoStatus)
	r.DELETE("/api/metadata/videos/:id", authMiddleware, metadataHandler.DeleteVideo)
	r.GET("/api/channel/:username", metadataHandler.GetChannel)
	r.GET("/api/channel/id/:user_id/videos", metadataHandler.GetUserVideos)

	// Webhooks
	webhookHandler := live.NewWebhookHandler(s3Service, db)
	r.Any("/api/webhooks/mediamtx", webhookHandler.HandleMediaMTXWebhook)
	r.POST("/api/webhooks/mediamtx/auth", webhookHandler.HandleMediaMTXAuth)

	// API Gateway routes
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "StreamForge API Gateway & Auth Service",
		})
	})

	logger.Log.Info("API Gateway & Auth running on :8080")
	if err := r.Run(":8080"); err != nil {
		logger.Log.Fatal("Failed to start server", zap.Error(err))
	}
}

func getEnvOrDefault(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
