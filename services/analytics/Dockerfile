# syntax=docker/dockerfile:1

FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WYZ_ANALYTICS_MODE=remote \
    WYZ_ANALYTICS_BLOB_BACKEND=remote \
    WYZ_ANALYTICS_LOG_LEVEL=INFO

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir . \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin wyzworker \
    && mkdir -p /var/lib/wyz-analytics \
    && chown -R wyzworker:wyzworker /var/lib/wyz-analytics /app

USER wyzworker

ENV WYZ_ANALYTICS_WORK_DIR=/var/lib/wyz-analytics

# Polling worker only — no HTTP port exposed.
CMD ["python", "-m", "wyz_analytics.workers.runner"]
