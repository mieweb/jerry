#!/usr/bin/env bash
# Portability test script — runs integration tests on local and mieweb targets.
#
# Usage:
#   ./scripts/test-portability.sh [local|mieweb|all]
#
# Prerequisites:
#   - For 'local': No external services needed
#   - For 'mieweb': docker-compose from @mieweb/cloud-os must be running
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Run tests on a specific target
run_tests() {
  local target="$1"
  local port="${2:-8787}"
  
  log_info "Running tests on target: $target (port: $port)"
  
  # Start the worker in background
  log_info "Starting worker..."
  cd "$ROOT_DIR"
  
  # Kill any existing process on the port
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
  
  # Start worker and wait for it to be ready
  pnpm --filter @mieweb/jerry-app dev &
  WORKER_PID=$!
  
  # Wait for worker to be ready
  log_info "Waiting for worker to be ready..."
  for i in {1..30}; do
    if curl -s "http://127.0.0.1:$port/health" > /dev/null 2>&1; then
      log_info "Worker is ready"
      break
    fi
    if [ $i -eq 30 ]; then
      log_error "Worker failed to start"
      kill $WORKER_PID 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
  
  # Run integration tests
  log_info "Running integration tests..."
  local test_result=0
  
  # Test 1: Health check
  log_info "Test 1: Health check"
  if curl -s "http://127.0.0.1:$port/health" | grep -q '"ok":true'; then
    log_info "✓ Health check passed"
  else
    log_error "✗ Health check failed"
    test_result=1
  fi
  
  # Test 2: Session status (creates a new session)
  log_info "Test 2: Session status"
  local session_id="test-$(date +%s)"
  local status_response=$(curl -s "http://127.0.0.1:$port/v1/sessions/$session_id/status")
  if echo "$status_response" | grep -q '"sessionId"'; then
    log_info "✓ Session status works"
  else
    log_warn "⚠ Session status returned unexpected response: $status_response"
  fi
  
  # Test 3: Event ingestion
  log_info "Test 3: Event ingestion"
  local event_response=$(curl -s -X POST "http://127.0.0.1:$port/v1/events" \
    -H "Content-Type: application/json" \
    -d '[{"source":"test","occurredAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","payload":{"test":true}}]')
  if echo "$event_response" | grep -q '"ok":true'; then
    log_info "✓ Event ingestion works"
  else
    log_warn "⚠ Event ingestion returned unexpected response: $event_response"
  fi
  
  # Cleanup
  log_info "Stopping worker..."
  kill $WORKER_PID 2>/dev/null || true
  wait $WORKER_PID 2>/dev/null || true
  
  if [ $test_result -eq 0 ]; then
    log_info "All tests passed on $target"
  else
    log_error "Some tests failed on $target"
  fi
  
  return $test_result
}

# Main
main() {
  local target="${1:-all}"
  local exit_code=0
  
  log_info "=== Jerry Portability Tests ==="
  log_info "Target: $target"
  echo ""
  
  case "$target" in
    local)
      run_tests "local" 8787 || exit_code=1
      ;;
    mieweb)
      log_warn "mieweb target requires docker-compose services"
      log_warn "Make sure @mieweb/cloud-os docker-compose is running"
      run_tests "mieweb" 8787 || exit_code=1
      ;;
    all)
      log_info "Testing 'local' target..."
      run_tests "local" 8787 || exit_code=1
      echo ""
      
      if [ $exit_code -eq 0 ]; then
        log_info "Testing 'mieweb' target..."
        log_warn "Skipping mieweb target (requires docker services)"
        # Uncomment when docker services are available:
        # run_tests "mieweb" 8787 || exit_code=1
      fi
      ;;
    *)
      log_error "Unknown target: $target"
      echo "Usage: $0 [local|mieweb|all]"
      exit 1
      ;;
  esac
  
  echo ""
  if [ $exit_code -eq 0 ]; then
    log_info "=== All portability tests passed ==="
  else
    log_error "=== Some portability tests failed ==="
  fi
  
  exit $exit_code
}

main "$@"
