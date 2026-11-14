package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"streamforge/internal/auth"
	"streamforge/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// RequireAuth validates the JWT access token and hydrates the user identity.
// It leverages a Redis Cache-Aside pattern (user:profile:{id}) to avoid hammering PostgreSQL
// on every single authenticated request.
func RequireAuth(db *gorm.DB, rdb *redis.Client) gin.HandlerFunc {
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

		user, err := getUserWithCache(c, db, rdb, userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		c.Set("userID", user.ID)
		c.Set("user", user)
		c.Next()
	}
}

// OptionalAuth checks for a token but does not abort if it is missing or invalid.
func OptionalAuth(db *gorm.DB, rdb *redis.Client) gin.HandlerFunc {
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

		if user, err := getUserWithCache(c, db, rdb, userID); err == nil {
			c.Set("userID", user.ID)
			c.Set("user", user)
		}

		c.Next()
	}
}

// getUserWithCache retrieves the user profile from Redis cache first; on cache miss,
// it queries PostgreSQL and caches the result for 10 minutes.
func getUserWithCache(c *gin.Context, db *gorm.DB, rdb *redis.Client, userID uint) (models.User, error) {
	var user models.User

	if rdb != nil {
		ctx := c.Request.Context()
		cacheKey := fmt.Sprintf("user:profile:%d", userID)
		if cachedJSON, err := rdb.Get(ctx, cacheKey).Result(); err == nil && cachedJSON != "" {
			if err := json.Unmarshal([]byte(cachedJSON), &user); err == nil {
				return user, nil
			}
		}
	}

	// Cache miss: query PostgreSQL
	if err := db.First(&user, userID).Error; err != nil {
		return user, err
	}

	// Populate Redis cache with 10-minute TTL
	if rdb != nil {
		ctx := c.Request.Context()
		cacheKey := fmt.Sprintf("user:profile:%d", userID)
		if jsonBytes, err := json.Marshal(user); err == nil {
			_ = rdb.Set(ctx, cacheKey, jsonBytes, 10*time.Minute)
		}
	}

	return user, nil
}
