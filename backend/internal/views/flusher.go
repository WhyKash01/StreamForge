package views

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"streamforge/internal/logger"
	"streamforge/internal/models"
)

type Flusher struct {
	db       *gorm.DB
	rdb      *redis.Client
	interval time.Duration
	stopChan chan struct{}
	wg       sync.WaitGroup
}

// NewFlusher creates a new background view count flusher
func NewFlusher(db *gorm.DB, rdb *redis.Client, interval time.Duration) *Flusher {
	return &Flusher{
		db:       db,
		rdb:      rdb,
		interval: interval,
		stopChan: make(chan struct{}),
	}
}

// Start begins the periodic flush loop in a separate goroutine
func (f *Flusher) Start() {
	if f.rdb == nil {
		logger.Log.Warn("Redis client is nil. View count flusher will not start.")
		return
	}

	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		ticker := time.NewTicker(f.interval)
		defer ticker.Stop()

		logger.Log.Info("View count write-behind flusher started", zap.Duration("interval", f.interval))

		for {
			select {
			case <-ticker.C:
				f.Flush()
			case <-f.stopChan:
				logger.Log.Info("Stopping view count flusher, running final sweep...")
				f.Flush()
				return
			}
		}
	}()
}

// Stop gracefully signals the flusher to perform a final flush and exit
func (f *Flusher) Stop() {
	close(f.stopChan)
	f.wg.Wait()
	logger.Log.Info("View count flusher stopped cleanly.")
}

// Flush reads all dirty video IDs from Redis and updates PostgreSQL in batch
func (f *Flusher) Flush() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dirtyKey := "views:dirty_videos"
	videoIDs, err := f.rdb.SMembers(ctx, dirtyKey).Result()
	if err != nil || len(videoIDs) == 0 {
		return
	}

	for _, vidStr := range videoIDs {
		bufferKey := fmt.Sprintf("views:buffer:%s", vidStr)

		// Atomically get accumulated count and reset buffer to 0 (zero loss on concurrent increments)
		valStr, err := f.rdb.GetSet(ctx, bufferKey, 0).Result()
		if err != nil {
			continue
		}

		count, err := strconv.ParseInt(valStr, 10, 64)
		if err != nil || count <= 0 {
			f.rdb.Del(ctx, bufferKey)
			f.rdb.SRem(ctx, dirtyKey, vidStr)
			continue
		}

		vid, err := strconv.ParseUint(vidStr, 10, 32)
		if err != nil {
			f.rdb.SRem(ctx, dirtyKey, vidStr)
			continue
		}

		// Single atomic SQL update on PostgreSQL
		err = f.db.Model(&models.Video{}).Where("id = ?", vid).
			UpdateColumn("views", gorm.Expr("views + ?", count)).Error

		if err != nil {
			logger.Log.Error("Failed to flush views to PostgreSQL, recovering count in Redis",
				zap.Uint64("video_id", vid), zap.Int64("count", count), zap.Error(err))
			// Recover the count back to Redis buffer
			f.rdb.IncrBy(ctx, bufferKey, count)
		} else {
			f.rdb.SRem(ctx, dirtyKey, vidStr)
			// Invalidate playback cache so subsequent view counts are fresh
			f.rdb.Del(ctx, fmt.Sprintf("video:playback:%s", vidStr))
		}
	}
}
