package metadata

import (
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Video struct {
	gorm.Model
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
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
