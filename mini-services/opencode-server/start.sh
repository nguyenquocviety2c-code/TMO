#!/bin/bash
# Start OpenCode Server as a persistent daemon
# Auto-detects project root (3 levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$SCRIPT_DIR"
export OPENCODE_SERVER_PORT=18790
export OPENCODE_WORKSPACE="${OPENCODE_WORKSPACE:-$PROJECT_ROOT}"

# Double-fork to daemonize
(bun server.ts > /tmp/opencode-server.log 2>&1 &)
echo "OpenCode Server started (workspace: $OPENCODE_WORKSPACE)"
