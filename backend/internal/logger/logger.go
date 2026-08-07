package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"os"
)

var Log *zap.Logger

func InitLogger() {
	config := zap.NewProductionConfig()
	// Output to stdout for Docker/Kubernetes log aggregation
	config.OutputPaths = []string{"stdout"}
	
	// Format timestamps in ISO8601
	config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	
	// Use environment to determine log level (default: Info)
	if os.Getenv("ENV") == "development" {
		config.Level = zap.NewAtomicLevelAt(zap.DebugLevel)
		config.Development = true
	} else {
		config.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	}

	logger, err := config.Build()
	if err != nil {
		panic(err)
	}
	
	Log = logger
}

// Sync flushes any buffered log entries
func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}
