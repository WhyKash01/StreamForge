package main

import (
	"log"
	"os"

	"streamforge/internal/metadata"
	"streamforge/internal/transcoder"
	"streamforge/internal/upload"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {
	// Initialize Database
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}
	dbDSN := "host=" + dbHost + " user=streamforge password=password dbname=streamforge port=5432 sslmode=disable"
	db, err := metadata.InitDB(dbDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Initialize S3
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "http://localhost:9000"
	}
	s3Service := upload.NewS3Service(
		minioEndpoint,
		"us-east-1",
		"minioadmin",
		"minioadmin",
		"streamforge",
	)

	// Initialize RabbitMQ
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://guest:guest@localhost:5672/"
	}
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	worker := &transcoder.Worker{
		DB:   db,
		S3:   s3Service,
		AMQP: conn,
	}

	log.Println("Initializing Transcoder Worker...")
	if err := worker.Start(); err != nil {
		log.Fatalf("Worker failed: %v", err)
	}
}
