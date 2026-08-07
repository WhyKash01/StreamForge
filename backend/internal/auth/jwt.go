package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	JwtSecretKey     = []byte("super-secret-key-change-in-prod")
	RefreshSecretKey = []byte("super-refresh-secret-change-in-prod")
)

func init() {
	if sec := os.Getenv("JWT_SECRET"); sec != "" {
		JwtSecretKey = []byte(sec)
	}
	if rSec := os.Getenv("JWT_REFRESH_SECRET"); rSec != "" {
		RefreshSecretKey = []byte(rSec)
	}
}

type TokenClaims struct {
	UserID uint `json:"user_id"`
	jwt.RegisteredClaims
}

func GenerateTokens(userID uint) (string, string, error) {
	// Access Token (15 minutes)
	accessClaims := TokenClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessString, err := accessToken.SignedString(JwtSecretKey)
	if err != nil {
		return "", "", err
	}

	// Refresh Token (7 days)
	refreshClaims := TokenClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshString, err := refreshToken.SignedString(RefreshSecretKey)
	if err != nil {
		return "", "", err
	}

	return accessString, refreshString, nil
}

func ValidateRefreshToken(tokenString string) (uint, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		return RefreshSecretKey, nil
	})
	
	if err != nil {
		return 0, err
	}
	
	if claims, ok := token.Claims.(*TokenClaims); ok && token.Valid {
		return claims.UserID, nil
	}
	
	return 0, errors.New("invalid refresh token")
}

func ValidateAccessToken(tokenString string) (uint, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		return JwtSecretKey, nil
	})
	
	if err != nil {
		return 0, err
	}
	
	if claims, ok := token.Claims.(*TokenClaims); ok && token.Valid {
		return claims.UserID, nil
	}
	
	return 0, errors.New("invalid access token")
}
