# ============================================================================
# MoodBeatz Recommendation Service — Dockerfile
#
# Build context: project root (.../MoodBeatz)
# Build command (from project root):
#   docker build -f recommendation_system/Dockerfile -t reco-service:dev .
#
# Design notes
# ------------
# 1. Backend ORM models (app.models.*) are resolved via PYTHONPATH=/app/backend.
#    We copy the full backend/ directory but do NOT run Alembic here — the
#    backend service owns migrations.
# 2. The image uses gunicorn + UvicornWorker for production-grade concurrency.
# 3. ML model weights are downloaded at runtime (DeepFace / torch) to keep the
#    image layer small and model versions decoupled from deploys.
# 4. All secrets come from docker-compose env_file; none are baked in.
# ============================================================================

FROM python:3.11-slim

WORKDIR /app

# System dependencies required by ML stack (OpenCV, libpq for asyncpg, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Python dependencies
# We install from recommendation_system/requirements.txt which is a curated
# subset of backend/requirements.txt (no Alembic, no migration tooling).
# ---------------------------------------------------------------------------
COPY recommendation_system/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Application code
# • backend/  → needed so `from app.models.*` resolves (ORM models live there)
# • recommendation_system/ → the standalone service package
# ---------------------------------------------------------------------------
COPY backend/ ./backend/
COPY recommendation_system/ ./recommendation_system/

# PYTHONPATH: lets Python resolve both `app.*` (ORM) and `recommendation_system.*`.
ENV PYTHONPATH=/app/backend

EXPOSE 8002

# ---------------------------------------------------------------------------
# Default command: gunicorn with UvicornWorker
# 2 workers for ML-heavy workload (torch is memory-intensive).
# Adjust via CMD override in docker-compose if needed.
# ---------------------------------------------------------------------------
CMD ["gunicorn", "recommendation_system.main:app", \
     "--bind", "0.0.0.0:8002", \
     "--workers", "2", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-"]
