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

# ── IP detection ───────────────────────────────────────────────────────────────
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

# ── Health check poll ──────────────────────────────────────────────────────────
# Args: $1 = URL to poll (full URL including scheme)
health_check_poll() {
  local health_url="$1"
  local max_attempts=36   # 36 × 5s = 3 minutes
  local attempt=0
  local healthy=false

  printf "\n  ${BOLD}Waiting for the app to become healthy…${RESET}\n"

  while [[ $attempt -lt $max_attempts ]]; do
    attempt=$(( attempt + 1 ))
    local status=""

    if command -v curl &>/dev/null; then
      status=$(curl -skf --max-time 4 "$health_url" 2>/dev/null || true)
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

# ── Tailscale hostname detection (from inside the container) ──────────────────
detect_ts_hostname() {
  local container_id="$1"
  local hostname=""

  # Try node
  if command -v node &>/dev/null; then
    hostname=$(docker exec "$container_id" tailscale status --json 2>/dev/null | node -e "
      let d=''; process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try { const n=JSON.parse(d).Self.DNSName; process.stdout.write(n.replace(/\\.$/,'')); }
        catch(e){ process.exit(1); }
      });
    " 2>/dev/null || true)
  fi

  # python3 fallback
  if [[ -z "$hostname" ]] && command -v python3 &>/dev/null; then
    hostname=$(docker exec "$container_id" tailscale status --json 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))" \
      2>/dev/null || true)
  fi

  printf '%s' "$hostname"
}

# ── nginx.conf patch (HTTP → HTTPS) ───────────────────────────────────────────
patch_nginx_for_tailscale() {
  local hostname="$1"
  local nginx_conf="frontend/nginx.conf"

  if grep -q 'listen 80' "$nginx_conf"; then
    info "Upgrading nginx.conf from HTTP → HTTPS for ${hostname}"
    local _tmp
    _tmp=$(mktemp)
    awk -v hn="$hostname" '
      /^    listen 80;/ {
        print "    listen 443 ssl;"
        next
      }
      /^    server_name _;/ {
        print "    server_name " hn ";"
        print ""
        print "    ssl_certificate     /etc/ssl/tailscale/" hn ".crt;"
        print "    ssl_certificate_key /etc/ssl/tailscale/" hn ".key;"
        print "    ssl_protocols       TLSv1.2 TLSv1.3;"
        print "    ssl_prefer_server_ciphers on;"
        next
      }
      { print }
    ' "$nginx_conf" > "$_tmp" && mv "$_tmp" "$nginx_conf"
    success "nginx.conf updated for HTTPS."
  else
    # Already HTTPS — check hostname
    local current_host
    current_host=$(grep -m1 'server_name' "$nginx_conf" | sed 's/.*server_name[[:space:]]*//;s/[[:space:]]*;//')
    if [[ "$current_host" != "$hostname" ]]; then
      info "Replacing hostname ${current_host} → ${hostname}"
      if [[ "${OSTYPE:-}" == darwin* ]]; then
        SED_I=(-i '')
      else
        SED_I=(-i)
      fi
      sed "${SED_I[@]}" \
        -e "s|server_name ${current_host};|server_name ${hostname};|g" \
        -e "s|/etc/ssl/tailscale/${current_host}|/etc/ssl/tailscale/${hostname}|g" \
        "$nginx_conf"
      success "nginx.conf hostname updated."
    else
      info "nginx.conf already configured for ${hostname} — no changes needed."
    fi
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

  # Read current values from root .env
  APP_PORT=$(grep -E '^APP_PORT=' .env 2>/dev/null | cut -d= -f2) || true
  APP_PORT="${APP_PORT:-80}"

  APP_TZ=$(grep -E '^TZ=' .env 2>/dev/null | cut -d= -f2) || true
  APP_TZ="${APP_TZ:-UTC}"

  SESSION_SECURE=$(grep -E '^SESSION_SECURE=' .env 2>/dev/null | cut -d= -f2) || true
  SESSION_SECURE="${SESSION_SECURE:-false}"

  COMPOSE_PROFILES=$(grep -E '^COMPOSE_PROFILES=' .env 2>/dev/null | cut -d= -f2) || true
  COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"

  # Read secrets from backend/.env so they survive volume recreation
  SESSION_SECRET=$(grep -E '^SESSION_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-) || true
  ENCRYPTION_KEY=$(grep -E '^ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-) || true

  # Preserve APP_BASE_URL if already set (e.g. a Tailscale hostname)
  APP_BASE_URL=$(grep -E '^APP_BASE_URL=' .env 2>/dev/null | cut -d= -f2-) || true

  if [[ -z "$APP_BASE_URL" ]]; then
    detect_ip
    if [[ -z "$DETECTED_IP" ]]; then
      error "Could not detect server IP."
      printf "  Set APP_BASE_URL in .env, then run: ${COMPOSE_CMD} up -d\n\n"
      exit 1
    fi
    APP_BASE_URL="http://${DETECTED_IP}:${APP_PORT}"
  fi

  # Keep backend/.env in sync
  set_env_var "APP_BASE_URL" "$APP_BASE_URL"

  # Rewrite root .env
  printf 'APP_PORT=%s\nAPP_BASE_URL=%s\nTZ=%s\nSESSION_SECURE=%s\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\nCOMPOSE_PROFILES=%s\n' \
    "$APP_PORT" "$APP_BASE_URL" "$APP_TZ" "$SESSION_SECURE" "$SESSION_SECRET" "$ENCRYPTION_KEY" "$COMPOSE_PROFILES" > .env

  if [[ -n "$COMPOSE_PROFILES" ]]; then
    TS_HOSTNAME=$(grep -E '^TS_HOSTNAME=' .env 2>/dev/null | cut -d= -f2) || true
    if [[ -n "$TS_HOSTNAME" ]]; then
      printf 'TS_HOSTNAME=%s\n' "$TS_HOSTNAME" >> .env
    fi
    info "Restarting with Tailscale profile (APP_BASE_URL=${APP_BASE_URL})"
    $COMPOSE_CMD --profile tailscale up -d
    health_check_poll "https://localhost/api/v1/health"
  else
    info "Restarting with APP_BASE_URL=${APP_BASE_URL}"
    $COMPOSE_CMD up -d
    health_check_poll "http://localhost:${APP_PORT}/api/v1/health"
  fi

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
printf "   • Configure your network access (Local or Tailscale HTTPS)\n"
printf "   • Write ${BOLD}backend/.env${RESET} from the example template\n"
printf "   • Build and start the app\n"
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

# ── [0/6] Install type ─────────────────────────────────────────────────────────
printf "\n  ${BOLD}Install type${RESET}\n"
printf "\n"
printf "   ${BOLD}1) Local${RESET}     — HTTP on your LAN, port 80\n"
printf "               Simple setup, no extra software\n"
printf "\n"
printf "   ${BOLD}2) Tailscale${RESET} — HTTPS with browser-trusted certificates ${BOLD}(recommended)${RESET}\n"
printf "               Secure cookies, push notifications, encrypted traffic\n"
printf "               Tailscale runs inside a Docker container — nothing installed on the host\n"
printf "\n"
ask "Enter 1 or 2 [2]:"
read -r INSTALL_TYPE_INPUT
INSTALL_TYPE_INPUT="${INSTALL_TYPE_INPUT:-2}"

case "$INSTALL_TYPE_INPUT" in
  1) INSTALL_TYPE="local"     ;;
  2) INSTALL_TYPE="tailscale" ;;
  *)
    error "Invalid choice '${INSTALL_TYPE_INPUT}'. Enter 1 or 2."
    exit 1
    ;;
esac

printf "\n"
if [[ "$INSTALL_TYPE" == "tailscale" ]]; then
  success "Install type: Tailscale HTTPS"
else
  success "Install type: Local HTTP"
fi

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

# ══════════════════════════════════════════════════════════════════════════════
# LOCAL INSTALL PATH
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$INSTALL_TYPE" == "local" ]]; then

  # ── [3/6] Frontend port ──────────────────────────────────────────────────────
  printf "\n  ${BOLD}[3/6] Frontend port${RESET}\n"

  APP_PORT=80
  info "Using port ${APP_PORT}"

  if [[ -n "$DETECTED_IP" ]]; then
    SUGGESTED_URL="http://${DETECTED_IP}:${APP_PORT}"
    info "Detected LAN IP: ${BOLD}${DETECTED_IP}${RESET}"
  else
    SUGGESTED_URL="http://localhost:${APP_PORT}"
    warn "Could not detect LAN IP — using localhost"
  fi

  # ── [4/6] APP_BASE_URL ───────────────────────────────────────────────────────
  printf "\n  ${BOLD}[4/6] APP_BASE_URL${RESET}\n"

  APP_BASE_URL="${SUGGESTED_URL%/}"
  set_env_var "APP_BASE_URL" "$APP_BASE_URL"
  success "APP_BASE_URL = ${APP_BASE_URL}"

  # ── [5/6] Timezone ───────────────────────────────────────────────────────────
  printf "\n  ${BOLD}[5/6] Timezone${RESET}\n"

  DETECTED_TZ=""
  if [[ -f /etc/timezone ]]; then
    DETECTED_TZ=$(cat /etc/timezone)
  elif command -v timedatectl &>/dev/null; then
    DETECTED_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
  elif [[ -L /etc/localtime ]]; then
    DETECTED_TZ=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||' 2>/dev/null || true)
  fi
  DETECTED_TZ="${DETECTED_TZ:-UTC}"
  APP_TZ="${DETECTED_TZ}"

  set_env_var "TZ" "$APP_TZ"
  success "TZ = ${APP_TZ}"

  # Write root .env
  printf 'APP_PORT=%s\nAPP_BASE_URL=%s\nTZ=%s\nSESSION_SECURE=false\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\nCOMPOSE_PROFILES=\n' \
    "$APP_PORT" "$APP_BASE_URL" "$APP_TZ" "$SESSION_SECRET" "$ENCRYPTION_KEY" > .env
  success "Root .env written"

  # ── [6/6] VAPID ──────────────────────────────────────────────────────────────
  printf "\n  ${BOLD}[6/6] Push notifications (optional)${RESET}\n"
  printf "  ${DIM}VAPID keys can be generated after startup — see instructions below.${RESET}\n"
  VAPID_DEFERRED=true

  # ── Summary ──────────────────────────────────────────────────────────────────
  printf "\n"
  printf "  ${BOLD}${GREEN}─── Configuration Summary ─────────────────────────────${RESET}\n"
  printf "  %-22s %s\n" "Install type"     "Local (HTTP)"
  printf "  %-22s %s\n" "APP_BASE_URL"     "$APP_BASE_URL"
  printf "  %-22s %s\n" "APP_PORT"         "$APP_PORT"
  printf "  %-22s %s\n" "TZ"               "$APP_TZ"
  printf "  %-22s %s\n" "SESSION_SECRET"   "${SESSION_SECRET:0:12}…  (auto-generated)"
  printf "  %-22s %s\n" "ENCRYPTION_KEY"   "${ENCRYPTION_KEY:0:12}…  (auto-generated)"
  printf "  ${BOLD}${GREEN}───────────────────────────────────────────────────────${RESET}\n"
  printf "\n"

  if [[ "${VAPID_DEFERRED:-false}" == true ]]; then
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
  health_check_poll "http://localhost:${APP_PORT}/api/v1/health"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# TAILSCALE INSTALL PATH
# ══════════════════════════════════════════════════════════════════════════════

# ── [3/6] Timezone (needed early for .env) ────────────────────────────────────
printf "\n  ${BOLD}[3/6] Timezone${RESET}\n"

DETECTED_TZ=""
if [[ -f /etc/timezone ]]; then
  DETECTED_TZ=$(cat /etc/timezone)
elif command -v timedatectl &>/dev/null; then
  DETECTED_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
elif [[ -L /etc/localtime ]]; then
  DETECTED_TZ=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||' 2>/dev/null || true)
fi
DETECTED_TZ="${DETECTED_TZ:-UTC}"
APP_TZ="${DETECTED_TZ}"

set_env_var "TZ" "$APP_TZ"
success "TZ = ${APP_TZ}"

# ── [4/6] Start Tailscale container ──────────────────────────────────────────
printf "\n  ${BOLD}[4/6] Starting Tailscale container${RESET}\n"
printf "\n"
printf "  ${YELLOW}Note:${RESET} Tailscale requires ${BOLD}/dev/net/tun${RESET}.\n"
printf "  This is available on Linux, WSL2, and most VPS/cloud hosts.\n"
printf "  Docker Desktop on macOS/Windows may require additional configuration.\n"
printf "\n"

# Write a stub root .env so docker compose can start the tailscale container
printf 'APP_PORT=443\nAPP_BASE_URL=https://localhost\nTZ=%s\nSESSION_SECURE=true\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\nCOMPOSE_PROFILES=tailscale\nTS_HOSTNAME=family-organizer\n' \
  "$APP_TZ" "$SESSION_SECRET" "$ENCRYPTION_KEY" > .env

info "Pulling tailscale/tailscale image and starting container…"
$COMPOSE_CMD --profile tailscale up -d tailscale

# Wait for container to start
TS_CONTAINER_ID=""
local_attempt=0
while [[ $local_attempt -lt 12 ]]; do
  TS_CONTAINER_ID=$($COMPOSE_CMD --profile tailscale ps -q tailscale 2>/dev/null || true)
  if [[ -n "$TS_CONTAINER_ID" ]]; then break; fi
  sleep 5
  local_attempt=$(( local_attempt + 1 ))
done

if [[ -z "$TS_CONTAINER_ID" ]]; then
  error "Tailscale container did not start."
  printf "  Check logs with: ${BOLD}${COMPOSE_CMD} --profile tailscale logs tailscale${RESET}\n\n"
  exit 1
fi
success "Tailscale container started (${TS_CONTAINER_ID:0:12})"

# ── [5/6] Tailscale authentication ───────────────────────────────────────────
printf "\n  ${BOLD}[5/6] Tailscale authentication${RESET}\n"
printf "\n"
printf "  Waiting for Tailscale auth URL…\n"

TS_AUTH_URL=""
local_attempt=0
while [[ $local_attempt -lt 24 ]]; do   # up to 2 minutes
  TS_AUTH_URL=$($COMPOSE_CMD --profile tailscale logs tailscale 2>/dev/null \
    | grep -oE 'https://login\.tailscale\.com/[^ ]+' | head -1 || true)
  if [[ -n "$TS_AUTH_URL" ]]; then break; fi
  # Also check if already authenticated (re-run with existing state)
  if docker exec "$TS_CONTAINER_ID" tailscale status &>/dev/null 2>&1; then
    TS_AUTH_URL="already-authenticated"
    break
  fi
  sleep 5
  local_attempt=$(( local_attempt + 1 ))
done

if [[ "$TS_AUTH_URL" == "already-authenticated" ]]; then
  success "Tailscale already authenticated (existing state restored)."
elif [[ -n "$TS_AUTH_URL" ]]; then
  printf "\n"
  printf "  ${BOLD}${CYAN}┌──────────────────────────────────────────────────────────────┐${RESET}\n"
  printf "  ${BOLD}${CYAN}│   Open this URL to add this host to your Tailscale account   │${RESET}\n"
  printf "  ${BOLD}${CYAN}└──────────────────────────────────────────────────────────────┘${RESET}\n"
  printf "\n"
  printf "  ${BOLD}${CYAN}%s${RESET}\n" "$TS_AUTH_URL"
  printf "\n"
  printf "  After approving in your browser, press ${BOLD}Enter${RESET} to continue…\n"
  read -r _ignored
else
  warn "Could not find Tailscale auth URL in container logs."
  printf "  Check manually with: ${BOLD}${COMPOSE_CMD} --profile tailscale logs tailscale${RESET}\n"
  printf "  After authenticating, press ${BOLD}Enter${RESET} to continue…\n"
  read -r _ignored
fi

# Poll until Tailscale is fully connected
printf "\n"
info "Verifying Tailscale connection…"
local_attempt=0
TS_CONNECTED=false
while [[ $local_attempt -lt 24 ]]; do   # up to 2 minutes
  if docker exec "$TS_CONTAINER_ID" tailscale status &>/dev/null 2>&1; then
    TS_STATUS=$(docker exec "$TS_CONTAINER_ID" tailscale status 2>/dev/null || true)
    if printf '%s' "$TS_STATUS" | grep -q -i "running\|connected\|logged in\|self"; then
      TS_CONNECTED=true
      break
    fi
  fi
  sleep 5
  local_attempt=$(( local_attempt + 1 ))
done

if [[ "$TS_CONNECTED" != "true" ]]; then
  error "Tailscale does not appear to be connected."
  printf "  Check: ${BOLD}docker exec ${TS_CONTAINER_ID:0:12} tailscale status${RESET}\n"
  printf "  Then re-run: ${BOLD}bash setup.sh --reconfigure${RESET}\n\n"
  exit 1
fi
success "Tailscale connected."

# ── Detect Tailscale hostname ─────────────────────────────────────────────────
TS_HOSTNAME=$(detect_ts_hostname "$TS_CONTAINER_ID")

if [[ -z "$TS_HOSTNAME" ]]; then
  warn "Could not auto-detect Tailscale hostname."
  ask "Tailscale hostname (e.g. mymachine.tail1234.ts.net):"
  read -r TS_HOSTNAME
  TS_HOSTNAME="${TS_HOSTNAME// /}"
  if [[ -z "$TS_HOSTNAME" ]]; then
    error "Hostname cannot be empty."
    exit 1
  fi
fi
success "Tailscale hostname: ${BOLD}${TS_HOSTNAME}${RESET}"

# ── Issue TLS certificate inside the container ────────────────────────────────
printf "\n"
info "Issuing TLS certificate inside the Tailscale container…"

docker exec "$TS_CONTAINER_ID" tailscale cert \
  --cert-file "/certs/${TS_HOSTNAME}.crt" \
  --key-file  "/certs/${TS_HOSTNAME}.key" \
  "$TS_HOSTNAME"

success "Certificate issued → /certs/${TS_HOSTNAME}.{crt,key}"

# ── [6/6] Configure nginx and environment ────────────────────────────────────
printf "\n  ${BOLD}[6/6] Configuring nginx and environment${RESET}\n"

patch_nginx_for_tailscale "$TS_HOSTNAME"

APP_PORT=443
APP_BASE_URL="https://${TS_HOSTNAME}"

# Write final root .env
printf 'APP_PORT=%s\nAPP_BASE_URL=%s\nTZ=%s\nSESSION_SECURE=true\nSESSION_SECRET=%s\nENCRYPTION_KEY=%s\nCOMPOSE_PROFILES=tailscale\nTS_HOSTNAME=%s\n' \
  "$APP_PORT" "$APP_BASE_URL" "$APP_TZ" "$SESSION_SECRET" "$ENCRYPTION_KEY" "$TS_HOSTNAME" > .env
success "Root .env written"

# Update backend/.env
set_env_var "APP_BASE_URL"   "$APP_BASE_URL"
set_env_var "SESSION_SECURE" "true"
success "backend/.env updated"

# ── Summary ────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}${GREEN}─── Configuration Summary ─────────────────────────────${RESET}\n"
printf "  %-22s %s\n" "Install type"     "Tailscale HTTPS"
printf "  %-22s %s\n" "APP_BASE_URL"     "$APP_BASE_URL"
printf "  %-22s %s\n" "APP_PORT"         "$APP_PORT"
printf "  %-22s %s\n" "TZ"               "$APP_TZ"
printf "  %-22s %s\n" "SESSION_SECURE"   "true"
printf "  %-22s %s\n" "SESSION_SECRET"   "${SESSION_SECRET:0:12}…  (auto-generated)"
printf "  %-22s %s\n" "ENCRYPTION_KEY"   "${ENCRYPTION_KEY:0:12}…  (auto-generated)"
printf "  ${BOLD}${GREEN}───────────────────────────────────────────────────────${RESET}\n"
printf "\n"

printf "  ${DIM}Optional integrations (Google Calendar, SMTP, Weather):${RESET}\n"
printf "  ${DIM}Edit backend/.env — every variable is documented inline.${RESET}\n\n"

# ── Build and start all containers ────────────────────────────────────────────
printf "\n  ${BOLD}Building and starting containers…${RESET}\n"
printf "  ${DIM}(This may take several minutes on first run)${RESET}\n\n"

$COMPOSE_CMD --profile tailscale up -d --build

health_check_poll "https://${TS_HOSTNAME}/api/v1/health"

# ── Cert auto-renewal cron ────────────────────────────────────────────────────
printf "\n  ${BOLD}Certificate auto-renewal${RESET}\n"
printf "  ${DIM}Tailscale certs expire every ~90 days.${RESET}\n"

COMPOSE_FILE="$(pwd)/docker-compose.yml"
CRON_LINE="0 3 * * 1  docker exec \$(docker compose -f ${COMPOSE_FILE} --profile tailscale ps -q tailscale) tailscale cert --cert-file /certs/${TS_HOSTNAME}.crt --key-file /certs/${TS_HOSTNAME}.key ${TS_HOSTNAME} && docker exec \$(docker compose -f ${COMPOSE_FILE} --profile tailscale ps -q frontend) nginx -s reload"

if crontab -l 2>/dev/null | grep -qF "tailscale cert"; then
  info "Cert renewal cron already present — skipping."
else
  ask "Install weekly cert auto-renewal cron? [Y/n]:"
  read -r CRON_ANSWER
  CRON_ANSWER="${CRON_ANSWER:-Y}"
  if [[ ! "${CRON_ANSWER,,}" == "n" ]]; then
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    success "Cron installed (runs every Monday at 3 AM)."
  else
    info "Skipped. To install later: bash tailscale-setup.sh --cron"
  fi
fi

# ── Google OAuth reminder ──────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}If you use Google Calendar,${RESET} add this Authorised redirect URI in Google Cloud Console:\n"
printf "    ${CYAN}https://${TS_HOSTNAME}/api/v1/integrations/google/callback${RESET}\n"
printf "\n"
printf "  ${DIM}Renewal commands:${RESET}\n"
printf "    bash tailscale-setup.sh --renew   ${DIM}# re-issue cert + reload nginx (host-based)${RESET}\n"
printf "    make logs                          ${DIM}# follow live container logs${RESET}\n"
printf "\n"
