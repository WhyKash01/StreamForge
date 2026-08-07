package main

import (
	"context"
	"fmt"
	"log"
	
	"github.com/joho/godotenv"
	"streamforge/internal/upload"
)

func main() {
	godotenv.Load("../.env")
	
	s3Service := upload.NewS3Service(
		"http://localhost:9000",
		"us-east-1",
		"minioadmin",
		"minioadmin",
		"streamforge",
	)
	
	filePath := "../recordings/live/e8027881-84f6-4892-9ba4-c7391030ed8d_1786064365.mp4.mp4"
	objectKey := "videos/1/test_manual_upload.mp4"
	
	fmt.Printf("Uploading %s to %s\n", filePath, objectKey)
	err := s3Service.UploadFile(context.Background(), objectKey, filePath)
	if err != nil {
		log.Fatalf("Upload failed: %v", err)
	}
	
	fmt.Println("Upload successful!")
}
