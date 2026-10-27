#!/usr/bin/env bash
# Starts an isolated wrangler dev instance with its own D1 and R2 state.
# usage: dev.sh <port> <name> [prod]   ("prod" starts from a copy of the production data, otherwise a fresh seeded DB)
set -euo pipefail
PORT="${1:?port}"; NAME="${2:?name}"; MODE="${3:-fresh}"
SP=/tmp/claude-0/-home-user-sessions/e4158143-0612-583f-a6cc-25c7b8ce3d86/scratchpad
STATE="$SP/instances/$NAME"
cd /home/user/sessions
if [ -f "$STATE/pid" ] && kill -0 "$(cat "$STATE/pid")" 2>/dev/null; then echo "instance $NAME already running on $(cat "$STATE/port")"; exit 0; fi
rm -rf "$STATE"; mkdir -p "$STATE"
if [ "$MODE" = "prod" ]; then
  node "$SP/harness/import-prod.mjs" "$(ls -t "$SP"/backups/prod-before-*.sql | head -1)" "$STATE" >/dev/null 2>&1
fi
npx wrangler d1 migrations apply sessions-db --local --persist-to "$STATE" >"$STATE/migrate.log" 2>&1 || { tail -20 "$STATE/migrate.log"; exit 1; }
setsid nohup npx wrangler dev --port "$PORT" --ip 127.0.0.1 --persist-to "$STATE" >"$STATE/dev.log" 2>&1 &
echo $! >"$STATE/pid"; echo "$PORT" >"$STATE/port"
for i in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/catalog" || true)" = "200" ]; then
    echo "ready: http://127.0.0.1:$PORT   state: $STATE   stop: bash $SP/harness/stop.sh $NAME"; exit 0
  fi
  sleep 1
done
echo "did not start, see $STATE/dev.log"; tail -20 "$STATE/dev.log"; exit 1
