package main

import (
	"fmt"
	"log"

	"streamforge/internal/metadata"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database
	db, err := metadata.InitDB("host=localhost user=streamforge password=password dbname=streamforge port=5432 sslmode=disable")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	fmt.Println("Connected to PostgreSQL successfully")

	r := gin.Default()
	handler := metadata.NewHandler(db)

	r.GET("/api/metadata/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Example routes
	r.GET("/api/metadata/videos", handler.ListVideos)

	fmt.Println("Metadata Service running on :8081")
	if err := r.Run(":8081"); err != nil {
		log.Fatal(err)
	}
}
