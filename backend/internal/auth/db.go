package auth

import (
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email    string `gorm:"uniqueIndex;not null" json:"email"`
	Password string `gorm:"not null" json:"-"`
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&User{})
}
