#!/usr/bin/env bash
set -e

APP_NAME="hexadata-omnisight"

case "$1" in
  build)
    echo "=== Building OmniSight Stack Containers ==="
    docker compose build --no-cache
    ;;
  start)
    echo "=== Starting OmniSight Telemetry Stack ==="
    docker compose up -d
    docker compose ps
    ;;
  stop)
    echo "=== Stopping OmniSight Telemetry Stack ==="
    docker compose down
    ;;
  restart)
    echo "=== Restarting OmniSight Telemetry Stack ==="
    docker compose restart
    ;;
  logs)
    docker compose logs -f --tail=100
    ;;
  status)
    docker compose ps
    curl -s http://localhost:9000/api/v1/telemetry | jq .
    ;;
  *)
    echo "Usage: $0 {build|start|stop|restart|logs|status}"
    exit 1
    ;;
esac