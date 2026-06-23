#!/bin/bash
# Supervisor: keeps the Next.js dev server alive.
# Restarts it if it dies, and pings it periodically to keep the sandbox warm.
cd /home/z/my-project

LOG=/home/z/my-project/dev.log

start_server() {
  # Kill any leftover
  pkill -f "next-server" 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  sleep 1
  # Start fresh
  nohup bun run dev > "$LOG" 2>&1 &
  SERVER_PID=$!
  echo "[$(date +%H:%M:%S)] started dev server pid $SERVER_PID"
  # Wait for readiness
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/ 2>/dev/null)
    if [ "$code" = "200" ]; then
      echo "[$(date +%H:%M:%S)] server READY (HTTP 200)"
      return 0
    fi
    sleep 1
  done
  echo "[$(date +%H:%M:%S)] server failed to become ready"
  return 1
}

start_server

# Monitor loop: restart if down, ping to keep warm
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" != "200" ]; then
    echo "[$(date +%H:%M:%S)] server down (HTTP $code) — restarting..."
    start_server
  fi
  sleep 15
done
