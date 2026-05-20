@echo off
chcp 65001 >nul
echo [AI-DT] Starting backend server...
echo [AI-DT] API: http://localhost:8000
echo [AI-DT] Docs: http://localhost:8000/docs
echo [AI-DT] WS:   ws://localhost:8000/ws
echo.
cd /d "%~dp0"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
