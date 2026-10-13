package middleware

import (
	"net/http"
	"strings"

	"streamforge/internal/auth"
	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func RequireAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header must be Bearer <token>"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		userID, err := auth.ValidateAccessToken(tokenString)
		if err != nil {
			if err.Error() == "token expired" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Your token is expired", "code": "TOKEN_EXPIRED"})
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid access token"})
			}
			c.Abort()
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		c.Set("userID", user.ID)
		c.Set("user", user)
		c.Next()
	}
}

// OptionalAuth checks for a token but does not abort if it's missing or invalid
func OptionalAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.Next()
			return
		}

		tokenString := parts[1]
		userID, err := auth.ValidateAccessToken(tokenString)
		if err != nil {
			c.Next()
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err == nil {
			c.Set("userID", user.ID)
			c.Set("user", user)
		}
		
		c.Next()
	}
}
