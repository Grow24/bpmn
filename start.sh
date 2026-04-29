#!/usr/bin/env bash
set -euo pipefail

echo "Starting full BPMN stack..."
docker compose up --build
