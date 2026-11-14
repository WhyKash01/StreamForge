package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateAndValidateTokens(t *testing.T) {
	expectedUserID := uint(42)

	accessToken, refreshToken, err := GenerateTokens(expectedUserID)
	if err != nil {
		t.Fatalf("Failed to generate tokens: %v", err)
	}

	if accessToken == "" || refreshToken == "" {
		t.Fatal("Expected non-empty access and refresh tokens")
	}

	// Validate Access Token
	validatedAccessUID, err := ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken returned unexpected error: %v", err)
	}
	if validatedAccessUID != expectedUserID {
		t.Errorf("Expected UserID %d, got %d", expectedUserID, validatedAccessUID)
	}

	// Validate Refresh Token
	validatedRefreshUID, err := ValidateRefreshToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateRefreshToken returned unexpected error: %v", err)
	}
	if validatedRefreshUID != expectedUserID {
		t.Errorf("Expected UserID %d, got %d", expectedUserID, validatedRefreshUID)
	}
}

func TestValidateTamperedToken(t *testing.T) {
	_, err := ValidateAccessToken("tampered.token.string")
	if err == nil {
		t.Error("Expected error for tampered token, got nil")
	}
}

func TestValidateExpiredToken(t *testing.T) {
	// Create an intentionally expired token
	expiredClaims := TokenClaims{
		UserID: 99,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
	tokenStr, err := token.SignedString(JwtSecretKey)
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateAccessToken(tokenStr)
	if err == nil {
		t.Fatal("Expected error for expired token, got nil")
	}
	if err.Error() != "token expired" {
		t.Errorf("Expected 'token expired' error, got %v", err)
	}
}
