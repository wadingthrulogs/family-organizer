#!/usr/bin/env bash
# ==============================================================================
# Family Organizer — Setup & Start Script
# ==============================================================================
# Usage:
#   bash setup.sh                # Wizard on first run; quick-start thereafter
#   bash setup.sh --reconfigure  # Force full wizard even if .env exists
#   bash setup.sh --help         # Print usage
# Supports: Linux, macOS, WSL2
# ==============================================================================
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
BOLD=$'\e[1m'
DIM=$'\e[2m'
GREEN=$'\e[32m'
YELLOW=$'\e[33m'
CYAN=$'\e[36m'
RED=$'\e[31m'
RESET=$'\e[0m'

info()    { printf "  ${CYAN}→${RESET}  %s\n" "$*"; }
success() { printf "  ${GREEN}✓${RESET}  %s\n" "$*"; }
warn()    { printf "  ${YELLOW}!${RESET}  %s\n" "$*"; }
error()   { printf "  ${RED}✗${RESET}  %s\n" "$*" >&2; }
ask()     { printf "  ${BOLD}?${RESET}  %s " "$*"; }

print_usage() {
  printf "\n"
  printf "  ${BOLD}Family Organizer — Setup & Start Script${RESET}\n\n"
  printf "  ${BOLD}Usage:${RESET}\n"
  printf "    bash setup.sh                # Wizard on first run; quick-start thereafter\n"
  printf "    bash setup.sh --reconfigure  # Re-run wizard even if .env exists\n"
  printf "    bash setup.sh --help         # Show this help\n\n"
}

# ── Parse flags ────────────────────────────────────────────────────────────────
RECONFIGURE=false
for arg in "$@"; do
  case "$arg" in
    --reconfigure) RECONFIGURE=true ;;
    --help|-h)     print_usage; exit 0 ;;
  esac
done

ENV_FILE="backend/.env"

# ── Detect Docker (needed in both modes) ──────────────────────────────────────
if ! command -v docker &>/dev/null; then
  error "Docker is not installed or not in PATH."
  printf "  Install Docker Desktop: https://docs.docker.com/get-docker/\n\n"
  exit 1
fi

if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  error "Docker Compose not found. Install it from https://docs.docker.com/compose/"
  exit 1
fi

# ── Env-file helper ────────────────────────────────────────────────────────────
# Uses node for cross-platform in-place key updates.
# Falls back to mktemp if node is not on PATH.
set_env_var() {
  local key="$1"
  local value="$2"
  local file="${3:-$ENV_FILE}"

  if command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const key   = process.argv[1];
      const value = process.argv[2];
      const file  = process.argv[3];
      let content = fs.readFileSync(file, 'utf8');
      const regex = new RegExp('^' + key + '=.*', 'm');
      const line  = key + '=' + value;
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content = content.endsWith('\n') ? content + line + '\n' : content + '\n' + line + '\n';
      }
      fs.writeFileSync(file, content);
    " "$key" "$value" "$file"
  else
    # Pure-POSIX fallback: rewrite via temp file
    local tmp
    tmp=$(mktemp)
    grep -v "^${key}=" "$file" > "$tmp" || true
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$file"
  fi
}

# ── IP detection (shared by both modes) ───────────────────────────────────────
_is_ip() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

detect_ip() {
  DETECTED_IP=""
  local _ip=""

  # Linux / WSL: hostname -I (not available on Git Bash / macOS)
  if command -v hostname &>/dev/null; then
    _ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
    if _is_ip "$_ip"; then DETECTED_IP="$_ip"; fi
  fi

  # Linux / WSL: ip route fallback
  if [[ -z "$DETECTED_IP" ]] && command -v ip &>/dev/null; then
    _ip=$(ip route get 1 2>/dev/null | awk 'NR==1{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}') || true
    if _is_ip "$_ip"; then DETECTED_IP="$_ip"; fi
  fi

  # macOS only — never run on Windows/WSL (Windows ipconfig writes errors to stdout)
  if [[ -z "$DETECTED_IP" ]] && [[ "$(uname -s 2>/dev/null)" == "Darwin" ]]; then
    _ip=$(ipconfig getifaddr en0 2>/dev/null) || true
    if _is_ip "$_ip"; then DETECTED_IP="$_ip"; fi
  fi
}

# ── Health check poll (shared by both modes) ──────────────────────────────────
# Globals read: APP_BASE_URL, COMPOSE_CMD, IS_FIRST_RUN (optional, defaults false)
health_check_poll() {
  local port="$1"
  local health_url="http://localhost:${port}/api/v1/health"
  local max_attempts=36   # 36 × 5s = 3 minutes
  local attempt=0
  local healthy=false

  printf "\n  ${BOLD}Waiting for the app to become healthy…${RESET}\n"

  while [[ $attempt -lt $max_attempts ]]; do
    attempt=$(( attempt + 1 ))
    local status=""

    if command -v curl &>/dev/null; then
      status=$(curl -sf --max-time 4 "$health_url" 2>/dev/null || true)
    elif command -v wget &>/dev/null; then
      status=$(wget -qO- --timeout=4 "$health_url" 2>/dev/null || true)
    fi

    if printf '%s' "$status" | grep -q '"status"'; then
      healthy=true
      break
    fi

    printf "  ${DIM}[%2d/%d] Not ready yet, waiting 5s…${RESET}\n" "$attempt" "$max_attempts"
    sleep 5
  done

  printf "\n"
  if [[ "$healthy" == true ]]; then
    printf "  ${BOLD}${GREEN}┌─────────────────────────────────────────────────────┐${RESET}\n"
    printf "  ${BOLD}${GREEN}│   Family Organizer is running!                      │${RESET}\n"
    printf "  ${BOLD}${GREEN}└─────────────────────────────────────────────────────┘${RESET}\n\n"
    printf "  ${BOLD}Open:${RESET}    ${CYAN}${APP_BASE_URL}${RESET}\n"
    if [[ "${IS_FIRST_RUN:-false}" == true ]]; then
      printf "  ${BOLD}Register:${RESET} ${CYAN}${APP_BASE_URL}/register${RESET}  ${DIM}← create your admin account${RESET}\n"
    fi
    printf "\n"
    printf "  ${DIM}Useful commands:${RESET}\n"
    printf "    make logs     ${DIM}# follow live container logs${RESET}\n"
    printf "    make status   ${DIM}# check container health${RESET}\n"
    printf "    make backup   ${DIM}# save a timestamped DB backup${RESET}\n"
    printf "    make down     ${DIM}# stop the app${RESET}\n\n"
  else
    warn "App did not respond within 3 minutes."
    printf "  Check logs with:  ${BOLD}${COMPOSE_CMD} logs -f${RESET}\n"
    printf "  Health endpoint:  ${BOLD}${health_url}${RESET}\n\n"
    exit 1
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# QUICK-START MODE — backend/.env already exists and --reconfigure not passed
# ══════════════════════════════════════════════════════════════════════════════
if [[ -f "$ENV_FILE" && "$RECONFIGURE" == false ]]; then

  printf "\n"
  printf "  ${BOLD}${CYAN}┌─────────────────────────────────────┐${RESET}\n"
  printf "  ${BOLD}${CYAN}│   Family Organizer — Quick Start    │${RESET}\n"
  printf "  ${BOLD}${CYAN}└─────────────────────────────────────┘${RESET}\n"
  printf "\n"

  success "Docker detected (using: ${COMPOSE_CMD})"

  # Read current APP_PORT, TZ, SESSION_SECURE from root .env
  APP_PORT=$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2) || true
  APP_PORT="${APP_PORT:-80}"

  APP_TZ=$(grep -E '^TZ=' .env 2>/dev/null | cut -d= -f2) || true
  APP_TZ="${APP_TZ:-UTC}"

  SESSION_SECURE=$(grep -E '^SESSION_SECURE=' .env 2>/dev/null | cut -d= -f2) || true
  SESSION_SECURE="${SESSION_SECURE:-false}"

  # Read secrets from backend/.env so they survive volume recreation
  SESSION_SECRET=$(grep -E '^SESSION_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-) || true
  ENCRYPTION_KEY=$(grep -E '^ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-) || true

  # Preserve APP_BASE_URL if already set (e.g. a Tailscale hostname)
  APP_BASE_URL=$(grep -E '^APP_BASE_URL=' .env 2>/dev/null | cut -d= -f2-) || true

  if [[ -z "$APP_BASE_URL" ]]; then
    APP_BASE_URL="http://localhost:${APP_PORT}"
  fi

  # Keep backend/.env in sync (in-place, preserves secrets)
  set_env_var "APP_BASE_URL" "$APP_BASE_URL"

  # Rewrite root .env (secrets included so docker-compose can substitute them)
  printf 'APP_PORT=%s\nAPP_BASE_URL=%s\nTZ=%s\nSESSION_SECURE=%s\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\n' \
    "$APP_PORT" "$APP_BASE_URL" "$APP_TZ" "$SESSION_SECURE" "$SESSION_SECRET" "$ENCRYPTION_KEY" > .env

  info "Restarting with APP_BASE_URL=${APP_BASE_URL}"
  printf "\n"

  $COMPOSE_CMD up -d

  health_check_poll "$APP_PORT"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# FULL WIZARD MODE — first run, or --reconfigure flag passed
# ══════════════════════════════════════════════════════════════════════════════
IS_FIRST_RUN=true

printf "\n"
printf "  ${BOLD}${CYAN}┌─────────────────────────────────────┐${RESET}\n"
printf "  ${BOLD}${CYAN}│   Family Organizer — Setup Wizard   │${RESET}\n"
printf "  ${BOLD}${CYAN}└─────────────────────────────────────┘${RESET}\n"
printf "\n"
printf "  This wizard will:\n"
printf "   • Generate cryptographic secrets\n"
printf "   • Set ${BOLD}APP_BASE_URL${RESET} to localhost\n"
printf "   • Write ${BOLD}backend/.env${RESET} from the example template\n"
printf "   • Optionally build and start the app\n"
printf "\n"

success "Docker detected (using: ${COMPOSE_CMD})"

# ── Check for example file ─────────────────────────────────────────────────────
EXAMPLE_FILE="backend/.env.example"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  error "backend/.env.example not found. Are you in the repo root?"
  exit 1
fi

# ── Handle existing .env ───────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  info "Overwriting existing ${ENV_FILE}…"
  IS_FIRST_RUN=false
fi

# Copy example to .env
cp "$EXAMPLE_FILE" "$ENV_FILE"
success "Created ${ENV_FILE} from example"

# ── [1/6] Generate secrets ─────────────────────────────────────────────────────
printf "\n  ${BOLD}[1/6] Generating secrets${RESET}\n"

if command -v openssl &>/dev/null; then
  SESSION_SECRET=$(openssl rand -hex 32)
elif command -v node &>/dev/null; then
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
else
  error "Neither openssl nor node found — cannot generate SESSION_SECRET."
  error "Install openssl or Node.js 20+, then re-run setup.sh."
  exit 1
fi
set_env_var "SESSION_SECRET" "$SESSION_SECRET"
success "SESSION_SECRET generated (64-char hex)"

if command -v openssl &>/dev/null; then
  ENCRYPTION_KEY=$(openssl rand -base64 32)
elif command -v node &>/dev/null; then
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
fi
set_env_var "ENCRYPTION_KEY" "$ENCRYPTION_KEY"
success "ENCRYPTION_KEY generated (base64, 32 bytes)"

# ── [2/6] Detect LAN IP ────────────────────────────────────────────────────────
printf "\n  ${BOLD}[2/6] Detecting local network address${RESET}\n"

detect_ip

# ── [3/6] Frontend port ────────────────────────────────────────────────────────
printf "\n  ${BOLD}[3/6] Frontend port${RESET}\n"

APP_PORT=80
info "Using port ${APP_PORT}  ${DIM}(run tailscale-setup.sh to enable HTTPS on 443)${RESET}"

SUGGESTED_URL="http://localhost:${APP_PORT}"

# ── [4/6] APP_BASE_URL ─────────────────────────────────────────────────────────
printf "\n  ${BOLD}[4/6] APP_BASE_URL${RESET}\n"

APP_BASE_URL="${SUGGESTED_URL%/}"

set_env_var "APP_BASE_URL" "$APP_BASE_URL"
success "APP_BASE_URL = ${APP_BASE_URL}"

# ── [5/6] Timezone ─────────────────────────────────────────────────────────────
printf "\n  ${BOLD}[5/6] Timezone${RESET}\n"

DETECTED_TZ=""
# Linux / WSL
if [[ -f /etc/timezone ]]; then
  DETECTED_TZ=$(cat /etc/timezone)
elif command -v timedatectl &>/dev/null; then
  DETECTED_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
# macOS
elif [[ -L /etc/localtime ]]; then
  DETECTED_TZ=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||' 2>/dev/null || true)
fi
DETECTED_TZ="${DETECTED_TZ:-UTC}"

APP_TZ="${DETECTED_TZ:-UTC}"

set_env_var "TZ" "$APP_TZ"
success "TZ = ${APP_TZ}"

# Write root .env — docker-compose reads this for variable substitution
printf 'APP_PORT=%s\nAPP_BASE_URL=%s\nTZ=%s\nSESSION_SECURE=false\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\n' \
  "$APP_PORT" "$APP_BASE_URL" "$APP_TZ" "$SESSION_SECRET" "$ENCRYPTION_KEY" > .env
success "Root .env written"

# ── [6/6] VAPID (push notifications) ──────────────────────────────────────────
printf "\n  ${BOLD}[6/6] Push notifications (optional)${RESET}\n"
printf "  ${DIM}VAPID keys can be generated after startup — see instructions below.${RESET}\n"

VAPID_DEFERRED=true

# ── Summary ────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}${GREEN}─── Configuration Summary ─────────────────────────────${RESET}\n"
printf "  %-22s %s\n" "APP_BASE_URL"     "$APP_BASE_URL"
printf "  %-22s %s\n" "APP_PORT"         "$APP_PORT"
printf "  %-22s %s\n" "TZ"               "$APP_TZ"
printf "  %-22s %s\n" "SESSION_SECRET"   "${SESSION_SECRET:0:12}…  (auto-generated)"
printf "  %-22s %s\n" "ENCRYPTION_KEY"   "${ENCRYPTION_KEY:0:12}…  (auto-generated)"
if [[ "$VAPID_DEFERRED" == true ]]; then
  printf "  %-22s %s\n" "VAPID keys"       "(not configured — see below)"
fi
printf "  ${BOLD}${GREEN}───────────────────────────────────────────────────────${RESET}\n"
printf "\n"

if [[ "$VAPID_DEFERRED" == true ]]; then
  printf "  ${YELLOW}${BOLD}Push notification VAPID keys — run after startup:${RESET}\n"
  printf "  ${DIM}%s exec backend node -e \\\\\n" "$COMPOSE_CMD"
  printf "    \"const wp=require('web-push');const k=wp.generateVAPIDKeys();\\\n"
  printf "     console.log('PUSH_VAPID_PUBLIC_KEY='+k.publicKey);\\\n"
  printf "     console.log('PUSH_VAPID_PRIVATE_KEY='+k.privateKey);\"${RESET}\n"
  printf "  ${DIM}Then add those values to backend/.env and run: make restart${RESET}\n\n"
fi

printf "  ${DIM}Optional integrations (Google Calendar, SMTP, Weather):${RESET}\n"
printf "  ${DIM}Edit backend/.env — every variable is documented inline.${RESET}\n\n"

printf "\n  ${BOLD}Building and starting containers…${RESET}\n"
printf "  ${DIM}(This may take several minutes on first run)${RESET}\n\n"

$COMPOSE_CMD up -d --build

health_check_poll "$APP_PORT"
