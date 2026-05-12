@echo off
cd /d "%~dp0"
start cmd /k "flask --app run run --host=0.0.0.0 --port=8080"
timeout /t 5
start cmd /k "cloudflared tunnel --url http://localhost:8080"
