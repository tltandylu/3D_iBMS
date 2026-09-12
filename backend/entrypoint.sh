#!/bin/sh
set -e

echo "[Entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[Entrypoint] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
