#!/usr/bin/env bash
#
# Recipe image-analysis watcher.
#
# Watches a directory for new images and runs Claude Code in headless mode
# (`claude -p`) to emit structured JSON about each image.
#
# BILLING: runs on the Claude *subscription* credit via the logged-in account
# in ~/.claude. It MUST NOT use the pay-as-you-go API. If ANTHROPIC_API_KEY is
# present, this script refuses to run (it would bill the Console account). There
# is intentionally NO API-key fallback — if subscription auth is unavailable the
# job fails loudly rather than silently switching billing.
#
# Note: `set -e` is deliberately NOT used — `read -d ''` and `inotifywait`
# return non-zero in normal operation, which would otherwise abort the script.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Config (override via environment / systemd unit) ─────────────────────────
WATCH_DIR="${WATCH_DIR:-/home/wade/uploads}"
OUTPUT_DIR="${OUTPUT_DIR:-/home/wade/recipe-output}"
CLAUDE_BIN="${CLAUDE_BIN:-/home/wade/.local/bin/claude}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-${HOME:-/home/wade}/.claude/.credentials.json}"
MAX_TURNS="${MAX_TURNS:-3}"
STDERR_LOG="${STDERR_LOG:-$OUTPUT_DIR/.claude-stderr.log}"

# ── Analysis prompt + output schema ──────────────────────────────────────────
# Extracts the ingredient / pantry items from a photo of a recipe so the app can
# add them to inventory. The model returns ONLY a JSON object matching the
# schema; the watcher writes it to <imagename>.json and the app reads `.items`.
# Edit this block to change what is extracted.
read -r -d '' PROMPT <<'EOF'
You are an automated step in a kitchen-inventory pipeline. Use the Read tool to
read the image at the path given at the end of this message. It is normally a
photo of a recipe, an ingredient list, a receipt, or grocery items. Extract every
distinct food/pantry item with its amount, and respond with ONLY a single JSON
object — no prose, no markdown, no code fences — exactly matching this schema:
{
  "title": "<the recipe or list name if visible, otherwise null>",
  "items": [
    {
      "name": "<concise item name, e.g. 'all-purpose flour'>",
      "quantity": <number or null>,
      "unit": "<unit such as cup, tbsp, oz, lb, g, ml, can, or null>",
      "category": "<a short grocery category like Produce, Dairy, Meat, Pantry, Spices, or null>"
    }
  ]
}
Rules: one object per distinct item; split combined lines; convert fractions like
"1 1/2" to 1.5; use null (not 0 or "") when an amount or unit is absent; do not
invent items. If the image has no readable items, return {"title": null, "items": []}.
Output JSON only.
Image path:
EOF

log() { echo "[$(date -Is)] $*"; }

# ── Billing guard: refuse to run on the API ──────────────────────────────────
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "[$(date -Is)] FATAL: ANTHROPIC_API_KEY is set; refusing to run to avoid pay-as-you-go API billing. This pipeline is subscription-only." >&2
  exit 1
fi

# ── Preflight ────────────────────────────────────────────────────────────────
if ! command -v inotifywait >/dev/null 2>&1; then
  echo "[$(date -Is)] FATAL: inotifywait not found (install inotify-tools)." >&2; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "[$(date -Is)] FATAL: node not found on PATH." >&2; exit 1
fi
if [ ! -x "$CLAUDE_BIN" ]; then
  echo "[$(date -Is)] FATAL: claude binary not executable at '$CLAUDE_BIN'." >&2; exit 1
fi
if [ ! -f "$CREDENTIALS_FILE" ]; then
  echo "[$(date -Is)] FATAL: subscription credentials not found at '$CREDENTIALS_FILE'. Run 'claude /login' (subscription) first." >&2; exit 1
fi
if [ ! -d "$WATCH_DIR" ]; then
  echo "[$(date -Is)] FATAL: WATCH_DIR '$WATCH_DIR' does not exist." >&2; exit 1
fi
if ! mkdir -p "$OUTPUT_DIR"; then
  echo "[$(date -Is)] FATAL: cannot create OUTPUT_DIR '$OUTPUT_DIR'." >&2; exit 1
fi

process_image() {
  local filepath="$1"
  local base out raw rc
  base="$(basename "$filepath")"
  out="$OUTPUT_DIR/${base}.json"

  if [ -f "$out" ]; then
    log "SKIP already processed: $base"
    return 0
  fi

  log "PROCESS $filepath"
  # </dev/null so claude never steals from the inotifywait pipe on stdin.
  raw="$("$CLAUDE_BIN" -p "${PROMPT} ${filepath}" \
        --allowedTools "Read" \
        --output-format json \
        --max-turns "$MAX_TURNS" \
        </dev/null 2>>"$STDERR_LOG")"
  rc=$?
  if [ $rc -ne 0 ]; then
    log "ERROR claude exited $rc for '$base' (see $STDERR_LOG). No auth fallback — leaving image unprocessed."
    return 0
  fi

  # Hand the JSON envelope to Node to extract .result, log cost/usage, and
  # write the model's JSON to <name>.json (or <name>.raw.txt if not valid JSON).
  printf '%s' "$raw" | OUT_FILE="$out" BASE="$base" node "$SCRIPT_DIR/parse-envelope.mjs"
}

log "watcher starting: WATCH_DIR=$WATCH_DIR OUTPUT_DIR=$OUTPUT_DIR CLAUDE_BIN=$CLAUDE_BIN (subscription auth, API key absent)"

inotifywait -m -e close_write -e moved_to --format '%w%f' "$WATCH_DIR" | while IFS= read -r filepath; do
  case "${filepath,,}" in
    *.jpg|*.jpeg|*.png|*.webp) ;;
    *) continue ;;
  esac
  [ -f "$filepath" ] || continue
  process_image "$filepath"
done

log "FATAL inotifywait exited; stopping so systemd can restart the service."
exit 1
