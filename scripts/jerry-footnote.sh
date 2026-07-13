#!/usr/bin/env bash
# Two-stage Footnote + Jerry helper.
#
# Stage 1 — index docs into FOOTNOTE_DB:
#   pnpm footnote:index -- [content-dir]
#   ./scripts/jerry-footnote.sh index [content-dir]
#
# Stage 2 — ask Jerry (starts worker with FOOTNOTE_DB if needed):
#   pnpm jerry:ask -- [--debug] search my notes about architecture
#   ./scripts/jerry-footnote.sh ask [--debug] search my notes about architecture
#
# Optional long-running worker only:
#   pnpm jerry:dev:footnote
#   ./scripts/jerry-footnote.sh dev
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PORT="${JERRY_PORT:-8787}"
BASE_URL="${JERRY_URL:-http://127.0.0.1:${PORT}}"
# Prefer the path from the footnote smoke docs; override with FOOTNOTE_DB=…
DEFAULT_DB="${FOOTNOTE_DB:-$HOME/jerry-footnote/.footnote}"
DEFAULT_CONTENT="${JERRY_FOOTNOTE_CONTENT:-$HOME/jerry-footnote-test}"
DEFAULT_MODEL="${JERRY_MODEL:-ollama:qwen2.5:3b}"
WORKER_PID_FILE="${TMPDIR:-/tmp}/jerry-footnote-worker.pid"

expand_path() {
  local raw="$1"
  if [[ "$raw" == ~/* ]]; then
    echo "${HOME}/${raw#~/}"
  else
    echo "$raw"
  fi
}

FOOTNOTE_DB="$(expand_path "$DEFAULT_DB")"
CONTENT_DIR="$(expand_path "$DEFAULT_CONTENT")"
export FOOTNOTE_DB
export JERRY_MODEL="$DEFAULT_MODEL"
export NODE_OPTIONS="${NODE_OPTIONS:---import tsx}"

usage() {
  cat <<EOF
Jerry + Footnote helper (two stages)

Stage 1 — build / refresh the footnote index:
  pnpm footnote:index -- [content-dir]
  FOOTNOTE_DB=~/jerry-footnote/.footnote pnpm footnote:index -- ~/my-notes

Stage 2 — ask Jerry (auto-starts worker if :${PORT} is down):
  pnpm jerry:ask -- search my notes about architecture
  pnpm jerry:ask -- --debug find fable 5 budget tips

Long-running worker only (then use jerry.js yourself):
  pnpm jerry:dev:footnote

Env defaults:
  FOOTNOTE_DB=${FOOTNOTE_DB}
  JERRY_FOOTNOTE_CONTENT=${CONTENT_DIR}
  JERRY_MODEL=${JERRY_MODEL}
  JERRY_URL=${BASE_URL}
EOF
}

worker_healthy() {
  curl -sf "${BASE_URL}/health" | grep -q '"ok"'
}

wait_for_worker() {
  local i
  for i in $(seq 1 45); do
    if worker_healthy; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cmd_index() {
  if [[ $# -ge 1 && "$1" != -* ]]; then
    CONTENT_DIR="$(expand_path "$1")"
    shift
  fi

  if [[ ! -d "$CONTENT_DIR" ]]; then
    echo "Content dir missing: $CONTENT_DIR"
    echo "Create it and add .md/.txt notes, or pass a path:"
    echo "  pnpm footnote:index ~/path/to/docs"
    exit 1
  fi

  mkdir -p "$FOOTNOTE_DB"
  echo "==> Indexing $CONTENT_DIR → $FOOTNOTE_DB"
  node "$ROOT_DIR/vendor/footnote/bin/docidx.js" build \
    --root "$CONTENT_DIR" \
    --content . \
    --out "$FOOTNOTE_DB" \
    --embedding-model ollama:nomic-embed-text \
    --copy-content \
    "$@"
  echo "==> Done. Ask Jerry with: pnpm jerry:ask \"search my notes about …\""
}

ensure_worker() {
  if worker_healthy; then
    echo "==> Worker already up at ${BASE_URL}"
    return 0
  fi

  echo "==> Starting Jerry worker (FOOTNOTE_DB=$FOOTNOTE_DB)"
  (
    cd "$ROOT_DIR"
    # Free the port if a dead process is stuck
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
    FOOTNOTE_DB="$FOOTNOTE_DB" pnpm --filter @mieweb/jerry-app dev
  ) >"${TMPDIR:-/tmp}/jerry-footnote-worker.log" 2>&1 &
  echo $! >"$WORKER_PID_FILE"

  if ! wait_for_worker; then
    echo "Worker failed to become healthy. Last log lines:"
    tail -n 40 "${TMPDIR:-/tmp}/jerry-footnote-worker.log" || true
    exit 1
  fi
  echo "==> Worker ready"
}

cmd_dev() {
  mkdir -p "$FOOTNOTE_DB"
  if [[ ! -d "$FOOTNOTE_DB" ]] || [[ ! -f "$FOOTNOTE_DB/index.sqlite" && ! -f "$FOOTNOTE_DB/footnote.sqlite" ]]; then
    echo "Note: no index found at $FOOTNOTE_DB yet."
    echo "Run stage 1 first: pnpm footnote:index [content-dir]"
  fi
  cd "$ROOT_DIR"
  echo "==> FOOTNOTE_DB=$FOOTNOTE_DB"
  echo "==> JERRY_MODEL=$JERRY_MODEL"
  exec env FOOTNOTE_DB="$FOOTNOTE_DB" JERRY_MODEL="$JERRY_MODEL" pnpm --filter @mieweb/jerry-app dev
}

cmd_ask() {
  if [[ ! -d "$FOOTNOTE_DB" ]]; then
    echo "FOOTNOTE_DB missing: $FOOTNOTE_DB"
    echo "Run stage 1 first: pnpm footnote:index [content-dir]"
    exit 1
  fi

  ensure_worker

  if [[ $# -eq 0 ]]; then
    echo "Usage: pnpm jerry:ask [--debug] <message…>"
    exit 1
  fi

  cd "$ROOT_DIR"
  echo "==> Asking Jerry…"
  exec env \
    FOOTNOTE_DB="$FOOTNOTE_DB" \
    JERRY_MODEL="$JERRY_MODEL" \
    NODE_OPTIONS="$NODE_OPTIONS" \
    node "$ROOT_DIR/packages/cli/bin/jerry.js" "$@"
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    index) cmd_index "$@" ;;
    ask) cmd_ask "$@" ;;
    dev) cmd_dev "$@" ;;
    help|-h|--help|"") usage ;;
    *)
      echo "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
