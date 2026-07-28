# run.ps1
# Centralized script to start all StreamForge services on Windows
# .\run.ps1
Write-Host "Starting PostgreSQL Database via Docker..." -ForegroundColor Cyan
docker-compose up -d --build

Write-Host "Waiting a few seconds for the database to be ready..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "Starting API Gateway & Auth Service (Port 8080)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; go run cmd/api_gateway/main.go"

Write-Host "Starting Metadata Service (Port 8081)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; go run cmd/metadata_service/main.go"

Write-Host "Starting Transcoder Worker (Docker Logs)..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "docker logs --tail 0 -f streamforge-transcoder-1"

Write-Host "Starting Vite Frontend..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "All services have been launched in separate windows!" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Magenta
Write-Host "API Gateway: http://localhost:8080" -ForegroundColor Green
Write-Host "Metadata Service: http://localhost:8081" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Cyan
