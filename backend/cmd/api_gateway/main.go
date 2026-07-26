package main

import (
	"fmt"
	"log"

	"streamforge/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Connect to Database
	dsn := "host=localhost user=streamforge password=password dbname=streamforge port=5432 sslmode=disable"
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
		AllowOrigins:     []string{"http://localhost:5173"},
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
