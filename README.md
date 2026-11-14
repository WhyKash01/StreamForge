<div align="center">

<img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=for-the-badge&logo=go&logoColor=white" />
<img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
<img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/NVIDIA-NVENC-76B900?style=for-the-badge&logo=nvidia&logoColor=white" />

# 🎬 StreamForge

**A production-grade, full-stack video streaming & live broadcasting platform.**

*Built on a microservices architecture supporting RTMP ingest, sub-second WebRTC delivery, GPU-accelerated VOD transcoding, and real-time user interactions — all containerized and ready to scale.*

---

</div>

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Service Breakdown](#-service-breakdown)
- [Data Flow](#-data-flow)
- [Engineering Highlights](#-engineering-highlights)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Scalability Design](#-scalability-design)

---

## 🌐 Overview

StreamForge is a modern, full-stack streaming platform inspired by Twitch and YouTube. It handles two distinct workloads:

1. **Live Streaming** — Broadcasters push an RTMP stream from OBS Studio; viewers consume it via WebRTC with sub-second latency.
2. **Video-on-Demand (VOD)** — Users upload MP4 files directly to object storage, which are asynchronously transcoded into adaptive-bitrate HLS playlists using GPU-accelerated FFmpeg.

The platform is built as a **polyglot microservices system** — a Go backend ecosystem, a React/Vite SPA frontend, and a suite of infrastructure services orchestrated via Docker Compose.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔴 **Live Streaming** | RTMP ingest via OBS → sub-second WebRTC (WHEP) delivery to viewers with HLS fallback |
| 💬 **Real-Time Live Chat** | WebSocket hub with Redis Pub/Sub cross-pod broadcast, rate limiting, and rolling history |
| 👥 **Live Viewer Tracking** | Real-time concurrent live viewer tracking and automatic viewer count synchronization |
| 🎥 **VOD Uploads** | Direct-to-S3 presigned URL uploads, bypassing the API for large files |
| ⚡ **Adaptive Transcoding** | Hardware-aware FFmpeg encoding (NVIDIA NVENC with dynamic CPU libx264 fallback) |
| 📼 **Adaptive Bitrate** | HLS multi-rendition output (1080p, 720p, 360p) with `hls.js` player & quality switcher |
| 🖼️ **Auto-Thumbnailing** | Automatic video poster extraction at second 3 via FFmpeg if no custom thumbnail is uploaded |
| ⏱️ **Metadata Extraction** | Accurate video duration and bitrate detection via `ffprobe` |
| 🚀 **Redis View Buffering** | HyperLogLog 24h deduplication + atomic `GETSET` zero-loss write-behind batch flusher to PostgreSQL |
| 🔐 **Auth & Security** | JWT access + refresh tokens with Redis Cache-Aside user profiling & rate limiting |
| 💬 **Comments & Likes** | ACID row-level locking (`SELECT FOR UPDATE`) and atomic SQL expressions |
| 🔍 **Feed Engine** | Database-level cursor/offset pagination, full-text search (`q=...`), and category filters |
| 📊 **Observability** | Prometheus metrics on active jobs, queue depth, HTTP latencies + Grafana dashboards |
| 🔄 **Resiliency** | Dead Letter Exchanges (DLX), exponential backoff retry policies, and graceful worker shutdown |
| 🗄️ **Versioned Migrations** | Clean SQL migration files (`.up.sql` / `.down.sql`) and GitHub Actions CI pipeline |

---

## 🏗️ System Architecture

The platform is composed of **five backend processes** and **four infrastructure services**, communicating via REST, webhooks, and an async message queue.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                                 │
│              React 19 + Vite · Redux Toolkit · hls.js                   │
└────────┬─────────────────────────────────┬────────────────────────────--─┘
         │ HTTP/REST (via Nginx)            │ HLS/WebRTC (direct)
         ▼                                 ▼
┌────────────────┐               ┌──────────────────────┐
│   Nginx        │               │   MediaMTX           │
│  (Reverse      │               │  (Media Server)      │
│   Proxy)       │               │  Port 1935 (RTMP)    │
└───────┬────────┘               │  Port 8888 (WebRTC)  │
        │                        └────────┬─────────────┘
   ┌────┴─────────┐                       │ Webhook Auth
   │              │             ┌─────────▼─────────────┐
   ▼              ▼             │   API Gateway          │
┌──────────┐ ┌───────────────┐  │   (Go / Gin)           │
│ Frontend │ │   API Gateway │◄─┘  Port :8080           │
│ (Static) │ │   (Go / Gin)  │  └──────────┬────────────┘
└──────────┘ └───────┬───────┘             │
                     │             ┌───────┴────────┐
             ┌───────┴──────┐      │                │
             ▼              ▼      ▼                ▼
       ┌──────────┐  ┌───────────────┐     ┌──────────────┐
       │PostgreSQL│  │    Redis      │     │   RabbitMQ   │
       │  (DB)    │  │  (Cache /     │     │  (Message    │
       └──────────┘  │   Rate Limit) │     │   Queue)     │
                     └───────────────┘     └──────┬───────┘
                                                  │ Consume
                                     ┌────────────▼────────────┐
                                     │  Transcoder Worker (Go) │
                                     │  + NVIDIA NVENC GPU     │
                                     └────────────┬────────────┘
                                                  │
                                          ┌───────▼────────┐
                                          │  MinIO / S3    │
                                          │ (Object Store) │
                                          └────────────────┘
```

### Full System Diagram (Mermaid)

```mermaid
graph TD
    OBS[OBS Studio - Broadcaster]
    Client[Browser Client - React/Vite]
    APIGateway[API Gateway - Go/Gin :8080]

    OBS -- "RTMP :1935" --> MediaMTX[MediaMTX Media Server]
    MediaMTX -- "Webhook Auth" --> APIGateway
    MediaMTX -- "WebRTC / HLS" --> Client

    Client -- "HTTP/REST via Nginx" --> APIGateway
    Client -- "Presigned URL Upload" --> MinIO[(MinIO / S3 Object Storage)]
    Client -- "HLS Playlist & Chunks" --> MinIO

    APIGateway -- "Read/Write" --> Postgres[(PostgreSQL)]
    APIGateway -- "Cache & Rate Limit" --> Redis[(Redis)]
    APIGateway -- "Publish video.uploaded" --> RabbitMQ[RabbitMQ]

    RabbitMQ -- "Consume Event" --> Transcoder[Transcoder Worker - Go]
    Transcoder -- "Download MP4" --> MinIO
    Transcoder -- "NVENC Encode" --> GPU[NVIDIA GPU]
    GPU -- "HLS Segments .m3u8 + .ts" --> MinIO
    Transcoder -- "Update Status" --> Postgres

    MetadataService[Metadata Service - Go] -- "MinIO Webhook" --> RabbitMQ
    MinIO -- "PUT Event Webhook" --> MetadataService

    subgraph Infrastructure
        Nginx[Nginx Reverse Proxy :80]
        Prometheus[Prometheus :9090]
        Grafana[Grafana :3000]
        Adminer[Adminer DB UI :8082]
    end

    Nginx --> APIGateway
    Nginx --> Client
    APIGateway -- "Metrics" --> Prometheus
    Transcoder -- "Metrics" --> Prometheus
    Prometheus --> Grafana
```

---

## 🛠️ Tech Stack

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| Language | **Go 1.25** | High-performance, concurrent microservices |
| Framework | **Gin** | HTTP routing, middleware, validation |
| ORM | **GORM + pgx** | PostgreSQL access with row-level locking |
| Auth | **golang-jwt/jwt v5** | Access & refresh token lifecycle |
| Messaging | **RabbitMQ (amqp091-go)** | Async event queue with DLX retry logic |
| Cache | **Redis (go-redis v9)** | Read-through cache, rate limiting, view count batching |
| Object Storage | **MinIO (AWS SDK v2)** | S3-compatible VOD + asset storage with presigned URLs |
| Transcoding | **FFmpeg + NVENC** | GPU-accelerated HLS multi-rendition encoding |
| Media Server | **MediaMTX** | RTMP ingest → WebRTC/HLS/RTSP egress |
| Logging | **Uber Zap** | Structured, high-performance logging |
| Observability | **Prometheus client** | Custom metrics for jobs, queues, and views |

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Framework | **React 19 + Vite 8** | SPA with lightning-fast HMR |
| Language | **TypeScript 6** | End-to-end type safety |
| State | **Redux Toolkit** | Global auth + UI state management |
| Routing | **react-router-dom v7** | Client-side SPA routing |
| HTTP | **Axios** | Interceptor-based JWT auth injection |
| Streaming | **hls.js** | Adaptive bitrate HLS playback |
| Styling | **Tailwind CSS v4** | Utility-first responsive styling |
| Icons | **Lucide React** | Consistent icon library |

### Infrastructure

| Service | Image | Role |
|---|---|---|
| **PostgreSQL 15** | `postgres:15-alpine` | Primary relational database |
| **Redis 7** | `redis:7-alpine` | Cache, rate-limiter, view-count buffer |
| **RabbitMQ 3** | `rabbitmq:3-management-alpine` | Message broker with management UI |
| **MinIO** | `minio/minio:latest` | Local S3-compatible object storage |
| **MediaMTX** | `bluenviron/mediamtx:latest-ffmpeg` | Real-time media server |
| **Nginx** | `nginx:alpine` | Reverse proxy & static file serving |
| **Adminer** | `adminer` | Web-based database admin UI |

---

## 📦 Service Breakdown

StreamForge is composed of **three Go binaries**, each built and deployed as its own Docker container:

### 1. `api_gateway` — Primary API Server
- **Port:** `8080` (internal), exposed on `:80` via Nginx
- **Responsibility:** All user-facing API calls — auth, video metadata, likes, comments, channel info, subscriptions, and VOD upload orchestration.
- **Key Internals:**
  - Goroutine-per-request model via Gin handles thousands of concurrent requests without blocking.
  - JWT middleware validates access tokens; refresh endpoint issues new pairs.
  - `ToggleLikeVideo` uses `gorm.Expr` for atomic SQL increments (`likes_count = likes_count + 1`) with a row-level `SELECT FOR UPDATE` lock to prevent race conditions.
  - Presigned URL generation delegates heavy uploads directly to MinIO — the API never touches video bytes.
  - Prometheus counters and gauges exposed at `/metrics`.

### 2. `metadata_service` — Webhook Receiver & Event Publisher
- **Port:** `8081` (internal)
- **Responsibility:** Receives webhooks from MinIO (on new object PUT) and MediaMTX (on stream connect/disconnect), then publishes structured events to RabbitMQ.
- **Key Internals:**
  - MinIO is configured to fire a webhook to `metadata-service:8081/api/v1/webhooks/vod` on every S3 `PUT` event.
  - On receipt, the service creates a `Video` record in Postgres (status: `"Processing"`) and publishes a `video.uploaded` message to RabbitMQ.
  - MediaMTX auth webhook validates stream keys against the database and sets the stream's `is_live` flag.

### 3. `transcoder` — Async GPU Worker
- **Responsibility:** Long-running background worker. Consumes `video.uploaded` events from RabbitMQ, downloads the source file from MinIO, transcodes it with FFmpeg + NVENC, and uploads HLS output back to MinIO.
- **Key Internals:**
  - Graceful shutdown via `signal.NotifyContext` — drains active FFmpeg jobs before exiting.
  - DLX (Dead Letter Exchange) routing: jobs failing more than 3× (tracked via `x-retry-count` header) are moved to `transcode_dlq`.
  - Real-time FFmpeg progress is captured from `stderr` in a dedicated goroutine, parsed, debounced, and stored in a `sync.RWMutex`-protected map. Progress is queryable via an internal HTTP endpoint.
  - Prometheus metrics: `active_transcode_jobs`, `transcode_jobs_completed_total`, `transcode_jobs_failed_total`.

---

## 🔄 Data Flow

### Live Streaming Lifecycle

```
OBS Studio
  │
  │  RTMP stream (stream key in URL)
  ▼
MediaMTX :1935
  │
  │  POST /api/webhooks/mediamtx/auth  ──► API Gateway validates key vs. Postgres
  │                                         Sets user.is_live = true
  │  WebRTC / HLS (sub-second)
  ▼
Browser Viewer  ◄── hls.js or native WebRTC
```

### VOD Upload & Playback Lifecycle

```
Browser
  │
  │  1. GET /api/upload/presigned-url  ──► API Gateway generates presigned URL
  │  2. PUT {video bytes}              ──► MinIO directly (bypasses backend)
  │
MinIO  ──►  PUT event webhook  ──►  Metadata Service
                                          │
                                          │  Creates Video{status: "Processing"} in Postgres
                                          │  Publishes video.uploaded to RabbitMQ
                                          ▼
                                    RabbitMQ Queue
                                          │
                                          │  Consumed by Transcoder Worker
                                          ▼
                                    FFmpeg + NVENC GPU
                                          │  → 1080p.m3u8, 720p.m3u8 + .ts segments
                                          ▼
                                    MinIO (HLS output)
                                          │
                                          │  Updates Video{status: "Done"} in Postgres
                                          ▼
Browser ──► GET /api/videos/:id ──► API Gateway ──► Postgres
        ◄── { url: "https://minio/.../master.m3u8" }
        hls.js fetches segments directly from MinIO/CDN
```

---

## 🔬 Engineering Highlights

### Direct-to-S3 Uploads
The frontend requests a **Presigned URL** from the API Gateway and uploads video bytes directly to MinIO — the backend never buffers the file. This eliminates memory pressure on the API pods and allows files of any size to be uploaded efficiently.

### Atomic Like Operations & Race Condition Prevention
The like/unlike endpoint uses a combination of:
1. **Row-level locking** — `SELECT ... FOR UPDATE` ensures no two requests modify the same row simultaneously.
2. **Atomic SQL expressions** — `gorm.Expr("likes_count + ?", 1)` sends a single `UPDATE SET likes_count = likes_count + 1` query, avoiding a read-modify-write cycle.

### GPU-Accelerated Transcoding
The `transcoder` service runs inside a Docker container with NVIDIA GPU passthrough (`driver: nvidia`). FFmpeg uses the `h264_nvenc` encoder for hardware-accelerated encoding, achieving **5–10× throughput improvement** over CPU-only `libx264`.

Output profile (example):
```
ffmpeg -i input.mp4 \
  -c:v h264_nvenc -preset fast -b:v 5M -vf scale=1920:1080 \
  -c:a aac -hls_time 6 -hls_playlist_type vod \
  output/1080p.m3u8
```

### Redis-Buffered View Counts
View count increments go to Redis first (`INCR video:{id}:views`), bypassing Postgres. A background ticker periodically flushes accumulated counts to Postgres in a single batch `UPDATE`, preventing write storms on high-traffic videos.

### Resilient Message Queue
```
┌─────────────┐    fails 3×    ┌──────────────────┐
│  transcode  │ ─────────────► │  transcode_dlq   │
│   queue     │                │  (Dead Letter)   │
└─────────────┘                └──────────────────┘
      │
      │  x-retry-count header incremented on NACK
      │  Message re-queued with exponential backoff
      ▼
  Transcoder Worker
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| Docker Desktop | 24.x+ |
| Docker Compose | v2.x+ |
| NVIDIA GPU + Drivers | For GPU transcoding (optional) |
| NVIDIA Container Toolkit | For `driver: nvidia` in Compose |
| OBS Studio | For live streaming (optional) |

### 1. Clone the Repository

```bash
git clone https://github.com/WhyKash01/StreamForge.git
cd StreamForge
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your secrets (see [Configuration](#-configuration)).

### 3. Start All Services

```bash
docker compose up --build -d
```

> **Note:** On first run, `minio-setup` will automatically configure the bucket and event webhooks. Allow ~15 seconds for all services to initialize.

### 4. Access the Application

| Service | URL |
|---|---|
| **StreamForge App** | http://localhost |
| **MinIO Console** | http://localhost:9001 |
| **RabbitMQ Management** | http://localhost:15672 |
| **Adminer (DB UI)** | http://localhost:8082 |
| **API Gateway (direct)** | http://localhost:8080/api |

### 5. Live Streaming with OBS

1. Open OBS Studio → Settings → Stream
2. Set **Service** to `Custom...`
3. Set **Server** to `rtmp://localhost:1935/live`
4. Set **Stream Key** to your stream key from the Studio page
5. Click **Start Streaming**

---

## ⚙️ Configuration

Key environment variables in `.env`:

```env
# Database
DB_HOST=localhost
DB_USER=streamforge
DB_PASSWORD=password
DB_NAME=streamforge
DB_PORT=5432

# MinIO / S3 Object Storage
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=streamforge

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672/

# JWT Secrets — CHANGE THESE IN PRODUCTION
JWT_SECRET=super-secret-key-change-in-prod
JWT_REFRESH_SECRET=super-refresh-secret-change-in-prod
```

> ⚠️ **Never commit real secrets.** Use Docker secrets, AWS Parameter Store, or Vault in production.

---

## 📁 Project Structure

```
StreamForge/
├── backend/
│   ├── cmd/
│   │   ├── api_gateway/        # API Gateway entry point (main.go)
│   │   ├── metadata_service/   # Metadata Service entry point
│   │   └── transcoder/         # Transcoder Worker entry point
│   ├── internal/
│   │   ├── auth/               # JWT handlers, login, register, refresh
│   │   ├── comments/           # Comment CRUD & like operations
│   │   ├── live/               # Live stream management & stream keys
│   │   ├── logger/             # Uber Zap logger setup
│   │   ├── metadata/           # Webhook receivers (MinIO, MediaMTX)
│   │   ├── middleware/         # Auth middleware, rate limiter
│   │   ├── models/             # GORM models: User, Video, Comment, Like
│   │   ├── transcoder/         # FFmpeg orchestration, progress tracking
│   │   ├── upload/             # Presigned URL generation
│   │   └── videos/             # Video CRUD, feed, likes
│   ├── Dockerfile.api
│   ├── Dockerfile.metadata
│   ├── Dockerfile.transcoder
│   └── go.mod
│
├── frontend/
│   ├── src/
│   │   ├── api/                # Axios instance with JWT interceptors
│   │   ├── components/         # Navbar, Sidebar, VideoPlayer, etc.
│   │   ├── pages/              # Home, Video, Studio, Live, Channel, etc.
│   │   └── store/              # Redux slices (auth, etc.)
│   ├── Dockerfile
│   └── package.json
│
├── nginx/
│   └── nginx.conf              # Reverse proxy config
│
├── mediamtx.yml                # MediaMTX server config
├── docker-compose.yml          # Core microservice orchestration
└── .env                        # Environment variables
```

---

## 📈 Scalability Design

StreamForge is architected to scale from a single Docker host to a distributed cloud deployment:

### Horizontal Scaling — Transcoder Fleet
Deploy the `transcoder` worker as a **Kubernetes Deployment** with **KEDA** (Kubernetes Event-Driven Autoscaling):
- KEDA watches the `transcode_queue` depth in RabbitMQ.
- Automatically spins up more GPU-enabled worker pods as queue depth grows.
- Scales back to zero when the queue is empty.

### Global Live Streaming Edge
- Deploy **MediaMTX** instances across multiple geographic regions.
- Broadcasters push to the nearest ingest node; the stream is replicated to viewer-edge nodes.
- A global load balancer (e.g., Cloudflare) routes viewers to the closest WebRTC edge.

### CDN-Backed VOD Delivery
- MinIO acts as the **origin server**.
- CDN edge nodes (Cloudflare, CloudFront) cache `.m3u8` playlists and `.ts` segments.
- On cache hit, video delivery has **zero load** on backend infrastructure.
- Cache-control headers are set per segment type: long TTL for `.ts` chunks, short TTL for `.m3u8` playlists.

### Database Scaling
- **Read replicas** for high-read endpoints (video feed, channel pages).
- **Redis caching layer** absorbs repeated reads for video metadata.
- **Partitioned tables** for `video_likes` and `comments` as data grows.

---

## 📝 License

This project is open-source. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ using Go, React, and a healthy obsession with performance.**

</div>
