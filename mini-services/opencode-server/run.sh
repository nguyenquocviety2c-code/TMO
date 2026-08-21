#!/bin/bash
# OpenCode Server Manager — keeps the server alive
# Auto-detects project root (3 levels up from this script)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PORT=18790
SERVER_DIR="$SCRIPT_DIR"
LOG="/tmp/opencode-server.log"
PID_FILE="$SERVER_DIR/.pid"
WORKSPACE="${OPENCODE_WORKSPACE:-$PROJECT_ROOT}"

export OPENCODE_WORKSPACE="$WORKSPACE"

echo "[Manager] Starting OpenCode Server manager..."
echo "[Manager] Project root: $PROJECT_ROOT"
echo "[Manager] Workspace: $WORKSPACE"

while true; do
    # Check if already running
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "[Manager] Server already running (PID $OLD_PID)"
            sleep 10
            continue
        fi
    fi

    echo "[Manager] Starting server..."
    cd "$SERVER_DIR"
    bun index.ts >> "$LOG" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"
    echo "[Manager] Server started with PID $PID"
    
    # Wait for the process
    wait "$PID" 2>/dev/null
    EXIT_CODE=$?
    echo "[Manager] Server exited with code $EXIT_CODE, restarting in 3s..."
    rm -f "$PID_FILE"
    sleep 3
done
