#!/bin/sh
# Ensure persistent work_dir exists and is writable by the runtime user.
set -eu

WORK_DIR="${WYZ_ANALYTICS_WORK_DIR:-/data/wyz-analytics-work}"
mkdir -p "$WORK_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R wyz:wyz "$WORK_DIR" || true
  exec runuser -u wyz -- "$@"
fi

exec "$@"
