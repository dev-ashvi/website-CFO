# syntax=docker/dockerfile:1
#
# ONE IMAGE — TWO COMMANDS (Compose):
#   API:    python -m wyz_analytics.workers.local_http
#   Worker: python -m wyz_analytics.workers.runner
#
# Local filesystem mode shares WYZ_ANALYTICS_WORK_DIR via a volume.
# Do not bake secrets, .env, or .wyz-analytics-work into the image.

FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    WYZ_ANALYTICS_MODE=local \
    WYZ_ANALYTICS_BLOB_BACKEND=filesystem \
    WYZ_ANALYTICS_LOG_LEVEL=INFO \
    WYZ_LOG_FORMAT=json \
    WYZ_OBSERVABILITY_ENABLED=true \
    WYZ_ANALYTICS_WORK_DIR=/data/wyz-analytics-work \
    WYZ_ANALYTICS_HOST=0.0.0.0 \
    WYZ_ANALYTICS_PORT=8788

COPY pyproject.toml README.md requirements.prod.txt ./
COPY src ./src
COPY docker/entrypoint.sh /entrypoint.sh

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.prod.txt \
    && pip install --no-cache-dir --no-deps . \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin wyz \
    && mkdir -p /data/wyz-analytics-work \
    && chown -R wyz:wyz /app /data/wyz-analytics-work \
    && chmod +x /entrypoint.sh \
    && sed -i 's/\r$//' /entrypoint.sh \
    && rm -rf /app/build /app/*.egg-info /tmp/pip-*

# Entrypoint starts as root only long enough to fix volume ownership, then drops to `wyz`.
USER root

EXPOSE 8788

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "-m", "wyz_analytics.workers.local_http"]
