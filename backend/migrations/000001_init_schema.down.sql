-- StreamForge Schema Rollback Migration
-- Migration: 000001_init_schema.down.sql

DROP TABLE IF EXISTS video_views CASCADE;
DROP TABLE IF EXISTS comment_likes CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS video_dislikes CASCADE;
DROP TABLE IF EXISTS video_likes CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS users CASCADE;
