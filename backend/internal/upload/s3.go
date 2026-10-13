package upload

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Service struct {
	Client        *s3.Client
	PresignClient *s3.PresignClient
	BucketName    string
}

func NewS3Service(endpoint, region, accessKey, secretKey, bucketName string) *S3Service {
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		log.Fatalf("unable to load SDK config, %v", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true // Required for MinIO
	})

	// Create a separate client for presigning that uses the public endpoint
	// This ensures the AWS Signature v4 is calculated with the correct Host header
	publicEndpoint := os.Getenv("MINIO_PUBLIC_ENDPOINT")
	if publicEndpoint == "" {
		publicEndpoint = endpoint
	}
	presignClientBase := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(publicEndpoint)
		o.UsePathStyle = true
	})
	presignClient := s3.NewPresignClient(presignClientBase)

	s3svc := &S3Service{
		Client:        client,
		PresignClient: presignClient,
		BucketName:    bucketName,
	}

	// Ensure bucket exists
	_, err = client.HeadBucket(context.TODO(), &s3.HeadBucketInput{
		Bucket: aws.String(bucketName),
	})
	if err != nil {
		fmt.Printf("Bucket %s does not exist, creating it...\n", bucketName)
		_, err = client.CreateBucket(context.TODO(), &s3.CreateBucketInput{
			Bucket: aws.String(bucketName),
		})
		if err != nil {
			log.Printf("Failed to create bucket: %v\n", err)
		} else {
			fmt.Printf("Bucket %s created successfully.\n", bucketName)
		}
	}

	return s3svc
}

// GeneratePresignedURL generates a pre-signed URL for uploading an object
func (s *S3Service) GeneratePresignedURL(ctx context.Context, objectKey string, contentType string) (string, error) {
	presignedReq, err := s.PresignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.BucketName),
		Key:         aws.String(objectKey),
		ContentType: aws.String(contentType),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})

	if err != nil {
		return "", fmt.Errorf("could not generate presigned url: %w", err)
	}

	return presignedReq.URL, nil
}

// GeneratePresignedGetURL generates a pre-signed URL for downloading/viewing an object
func (s *S3Service) GeneratePresignedGetURL(ctx context.Context, objectKey string) (string, error) {
	presignedReq, err := s.PresignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.BucketName),
		Key:    aws.String(objectKey),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 1 * time.Hour
	})

	if err != nil {
		return "", fmt.Errorf("could not generate presigned get url: %w", err)
	}

	return presignedReq.URL, nil
}

// ListVideos lists video objects in the bucket
func (s *S3Service) ListVideos(ctx context.Context) ([]string, error) {
	output, err := s.Client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.BucketName),
		Prefix: aws.String("videos/"),
	})
	if err != nil {
		return nil, fmt.Errorf("could not list objects: %w", err)
	}

	var keys []string
	for _, obj := range output.Contents {
		if obj.Key != nil {
			keys = append(keys, *obj.Key)
		}
	}
	return keys, nil
}

// UploadFile uploads a file from the local disk to the bucket
func (s *S3Service) UploadFile(ctx context.Context, objectKey string, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("unable to open file %v: %w", filePath, err)
	}
	defer file.Close()

	ext := filepath.Ext(filePath)
	var contentType string
	switch ext {
	case ".m3u8":
		contentType = "application/vnd.apple.mpegurl"
	case ".ts":
		contentType = "video/MP2T"
	case ".mp4":
		contentType = "video/mp4"
	default:
		contentType = "application/octet-stream"
	}

	_, err = s.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.BucketName),
		Key:         aws.String(objectKey),
		Body:        file,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("unable to upload file to S3: %w", err)
	}
	return nil
}

// DownloadFile downloads a file from the bucket to the local disk
func (s *S3Service) DownloadFile(ctx context.Context, objectKey string, filePath string) error {
	output, err := s.Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.BucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("unable to get object from S3: %w", err)
	}
	defer output.Body.Close()

	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("unable to create local file %v: %w", filePath, err)
	}
	defer file.Close()

	if _, err := io.Copy(file, output.Body); err != nil {
		return fmt.Errorf("unable to write body to file %v: %w", filePath, err)
	}

	return nil
}
