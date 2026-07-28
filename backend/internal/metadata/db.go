package metadata

import (
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Video struct {
	gorm.Model
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"` // Used for VOD URL or Live Stream URL
	Type        string `json:"type"` // "VOD" or "Live"
	Status      string `json:"status"` // "Uploaded", "Live", "Offline", "Processing", "Done"
}

// InitDB initializes the database connection and runs migrations
func InitDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// Auto migrate the Video struct
	if err := db.AutoMigrate(&Video{}); err != nil {
		return nil, err
	}

	return db, nil
}
