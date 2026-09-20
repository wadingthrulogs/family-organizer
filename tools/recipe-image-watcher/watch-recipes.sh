#!/usr/bin/env bash
#
# Recipe image-analysis watcher (and guest-display book lookups).
#
# Watches a directory and runs Claude Code in headless mode (`claude -p`):
#   *.jpg/*.png/*.webp  → extract pantry items from a recipe photo
#   *.book.json         → look up a book (cover + synopsis) for the reading list
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
# Book lookups browse (Open Library / Google Books, plus web search for obscure
# titles), so they get more turns than a single image read.
BOOK_MAX_TURNS="${BOOK_MAX_TURNS:-12}"
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
      "category": "<a short grocery category, or null>"
    }
  ]
}
Rules: one object per distinct item; split combined lines; convert fractions like
"1 1/2" to 1.5; use null (not 0 or "") when an amount or unit is absent; do not
invent items. If the image has no readable items, return {"title": null, "items": []}.
Output JSON only.
EOF

# ── Book lookup prompt ────────────────────────────────────────────────────────
# For the guest display's "currently reading" list. The app writes
# <id>.book.json = {"id","title","author"}; the model identifies the book and
# returns metadata plus a cover URL. finish-book.mjs downloads the cover on the
# host and writes <id>.book.result.json for the app to ingest.
read -r -d '' BOOK_PROMPT <<'EOF'
You are an automated step in a household display pipeline. Identify the book
described at the end of this message and gather its details. The author may be
missing or misspelled; the title may be approximate — pick the best-known match.

Use these sources, in order, with the WebFetch tool:
1. Open Library search: https://openlibrary.org/search.json?title=<title>&author=<author>&limit=5
   (URL-encode the values; omit author if unknown). Take the best match's
   "cover_i" and "first_publish_year". The cover image URL is then
   https://covers.openlibrary.org/b/id/<cover_i>-L.jpg
2. Google Books: https://www.googleapis.com/books/v1/volumes?q=intitle:<title>+inauthor:<author>&maxResults=5
   Use volumeInfo.description for the synopsis and imageLinks.thumbnail as a
   fallback cover (change http:// to https:// and zoom=1 to zoom=2 if present).
3. Only if those fail to identify the book, use WebSearch.

Then respond with ONLY a single JSON object — no prose, no markdown, no code
fences — exactly matching this schema:
{
  "found": true,
  "title": "<canonical title>",
  "author": "<author name(s)>",
  "year": <first publication year as an integer, or null>,
  "synopsis": "<2 to 3 sentences, spoiler-free, in your own words, plain text>",
  "coverUrl": "<https URL of the best cover image, or null>",
  "coverUrls": ["<alternative https cover URLs, best first>"]
}
If you genuinely cannot identify the book, respond with
{"found": false, "reason": "<short reason>"}.
Never invent a cover URL; only return URLs you saw in a source response.
Output JSON only.
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

  # Optional sidecar "<image>.ctx.json" written by the app carries the household's
  # existing inventory categories so the model labels items the way we already do.
  local guidance=""
  local ctx="${filepath}.ctx.json"
  if [ -f "$ctx" ]; then
    local cats
    cats="$(node -e 'try{const c=require(process.argv[1]);const a=Array.isArray(c.categories)?c.categories:[];process.stdout.write(a.filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim()).join(", "))}catch(e){}' "$ctx" 2>/dev/null)"
    if [ -n "$cats" ]; then
      guidance="The household already labels inventory with these categories: ${cats}. For each item's \"category\", reuse the closest matching label from that list; only use a new label when none reasonably fit."
    fi
  fi

  local prompt_text="${PROMPT}
${guidance}
Image path: ${filepath}"

  # </dev/null so claude never steals from the inotifywait pipe on stdin.
  raw="$("$CLAUDE_BIN" -p "$prompt_text" \
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

process_book() {
  local filepath="$1"
  local base id result claude_json raw rc fail_reason
  base="$(basename "$filepath")"
  id="${base%.book.json}"
  result="$OUTPUT_DIR/${id}.book.result.json"
  claude_json="$OUTPUT_DIR/${id}.book.claude.json"

  if [ -f "$result" ]; then
    log "SKIP book already processed: $id"
    return 0
  fi
  case "$id" in
    *[!A-Za-z0-9-]*|"") log "SKIP book: bad id '$id'"; return 0 ;;
  esac

  local title author
  title="$(node -e 'try{const b=require(process.argv[1]);process.stdout.write(String(b.title||"").slice(0,200))}catch(e){}' "$filepath" 2>/dev/null)"
  author="$(node -e 'try{const b=require(process.argv[1]);process.stdout.write(String(b.author||"").slice(0,200))}catch(e){}' "$filepath" 2>/dev/null)"
  if [ -z "$title" ]; then
    FAIL_REASON="Request had no title" OUTPUT_DIR="$OUTPUT_DIR" BOOK_ID="$id" node "$SCRIPT_DIR/finish-book.mjs"
    return 0
  fi

  log "LOOKUP book $id: '$title' by '${author:-?}'"

  local prompt_text="${BOOK_PROMPT}
Book title: ${title}
Author: ${author:-unknown}"

  fail_reason=""
  raw="$("$CLAUDE_BIN" -p "$prompt_text" \
        --allowedTools "WebFetch,WebSearch" \
        --output-format json \
        --max-turns "$BOOK_MAX_TURNS" \
        </dev/null 2>>"$STDERR_LOG")"
  rc=$?
  if [ $rc -ne 0 ]; then
    log "ERROR claude exited $rc for book '$id' (see $STDERR_LOG). No auth fallback."
    fail_reason="Lookup service error (claude exited $rc)"
  else
    printf '%s' "$raw" | OUT_FILE="$claude_json" BASE="book:$id" node "$SCRIPT_DIR/parse-envelope.mjs"
  fi

  # Always writes <id>.book.result.json (ok or error) so the app never waits
  # on a lookup that already finished badly.
  FAIL_REASON="$fail_reason" CLAUDE_JSON="$claude_json" OUTPUT_DIR="$OUTPUT_DIR" BOOK_ID="$id" \
    node "$SCRIPT_DIR/finish-book.mjs"
  rm -f "$claude_json" "${claude_json%.json}.raw.txt"
}

log "watcher starting: WATCH_DIR=$WATCH_DIR OUTPUT_DIR=$OUTPUT_DIR CLAUDE_BIN=$CLAUDE_BIN (subscription auth, API key absent)"

inotifywait -m -e close_write -e moved_to --format '%w%f' "$WATCH_DIR" | while IFS= read -r filepath; do
  [ -f "$filepath" ] || continue
  case "${filepath,,}" in
    *.jpg|*.jpeg|*.png|*.webp) process_image "$filepath" ;;
    *.book.json) process_book "$filepath" ;;
    *) continue ;;
  esac
done

log "FATAL inotifywait exited; stopping so systemd can restart the service."
exit 1
