package main

import (
	"fmt"
	"os"

	"streamforge/internal/logger"
	"streamforge/internal/models"
	"streamforge/internal/transcoder"
	"streamforge/internal/upload"

	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

func main() {
	godotenv.Load("../.env")
	logger.InitLogger()
	defer logger.Sync()

	logger.Log.Info("Starting Transcoder Service...")

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

	// Initialize S3
	s3Service := upload.NewS3Service(
		minioEndpoint,
		minioRegion,
		minioAccessKey,
		minioSecretKey,
		minioBucket,
	)

	// Initialize RabbitMQ

	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		logger.Log.Fatal("Failed to connect to RabbitMQ", zap.Error(err))
	}
	defer conn.Close()

	worker := &transcoder.Worker{
		DB:   db,
		S3:   s3Service,
		AMQP: conn,
	}

	logger.Log.Info("Initializing Transcoder Worker...")
	if err := worker.Start(); err != nil {
		logger.Log.Fatal("Worker failed", zap.Error(err))
	}
}

func getEnvOrDefault(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
