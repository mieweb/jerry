#!/usr/bin/env bash
# Inject MOCK_AW_DATA.json into a local ActivityWatch instance.
#
# Prerequisites:
#   - ActivityWatch running on http://localhost:5600 (override with AW_URL)
#   - curl + python3
#
# Usage (from repo root):
#   pnpm inject:mock-aw
#   ./scripts/inject-mock-aw.sh
#   AW_URL=http://127.0.0.1:5600 ./scripts/inject-mock-aw.sh path/to/other.json
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
AW_URL="${AW_URL:-http://localhost:5600}"
AW_URL="${AW_URL%/}"
DATA_FILE="${1:-$ROOT_DIR/MOCK_AW_DATA.json}"

if [[ ! -f "$DATA_FILE" ]]; then
  echo "error: mock data file not found: $DATA_FILE" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required to parse $DATA_FILE" >&2
  exit 1
fi

echo "Checking ActivityWatch at ${AW_URL}…"
if ! curl -sf "${AW_URL}/api/0/info" >/dev/null; then
  echo "error: ActivityWatch is not reachable at ${AW_URL}" >&2
  echo "Install: https://docs.activitywatch.net/en/latest/getting-started.html" >&2
  echo "Then start the AW server and re-run this script." >&2
  exit 1
fi

echo "Injecting mock buckets/events from ${DATA_FILE}…"

AW_URL="$AW_URL" DATA_FILE="$DATA_FILE" python3 <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

aw_url = os.environ["AW_URL"].rstrip("/")
path = os.environ["DATA_FILE"]

with open(path, encoding="utf-8") as f:
    doc = json.load(f)

buckets = doc.get("buckets", [])
if not buckets:
    print("error: no buckets in mock data", file=sys.stderr)
    sys.exit(1)


def request(method: str, url: str, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


for bucket in buckets:
    bucket_id = bucket["id"]
    meta = {
        "client": bucket.get("client", "aw-watcher-window"),
        "type": bucket.get("type", "currentwindow"),
        "hostname": bucket.get("hostname", "mock"),
    }
    code, _ = request("POST", f"{aw_url}/api/0/buckets/{bucket_id}", meta)
    if 200 <= code < 400:
        print(f"  bucket {bucket_id}  (HTTP {code})")
    else:
        # Already exists is fine — confirm with GET
        get_code, _ = request("GET", f"{aw_url}/api/0/buckets/{bucket_id}")
        if 200 <= get_code < 300:
            print(f"  bucket {bucket_id}  (already exists)")
        else:
            print(
                f"error: failed to create bucket {bucket_id} (HTTP {code})",
                file=sys.stderr,
            )
            sys.exit(1)

    events = bucket.get("events", [])
    code, raw = request(
        "POST", f"{aw_url}/api/0/buckets/{bucket_id}/events", events
    )
    if 200 <= code < 300:
        print(f"  events {bucket_id}  +{len(events)}  (HTTP {code})")
    else:
        detail = raw.decode("utf-8", errors="replace")[:500]
        print(
            f"error: failed to insert events into {bucket_id} (HTTP {code}): {detail}",
            file=sys.stderr,
        )
        sys.exit(1)

print()
print("Done. Try Jerry with a matching range, e.g.:")
print("  jerry what's my work summary from 2026-08-01 to 2026-08-03")
print()
print(
    "Tip: live AW is queried directly by summarize_activity — collector is optional for this mock."
)
PY
