#!/usr/bin/env bash
# usage: stop.sh <name>   stops the instance and everything it spawned
SP=/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad
STATE="$SP/instances/${1:?name}"
if [ -f "$STATE/pid" ]; then kill -TERM -- "-$(cat "$STATE/pid")" 2>/dev/null || kill -TERM "$(cat "$STATE/pid")" 2>/dev/null || true; rm -f "$STATE/pid"; fi
echo "stopped $1"
