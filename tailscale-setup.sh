#!/usr/bin/env bash
# ==============================================================================
# Family Organizer — Tailscale HTTPS Setup Script
# ==============================================================================
# Usage:
#   bash tailscale-setup.sh             # Full setup: cert + .env + rebuild + cron
#   bash tailscale-setup.sh --renew     # Re-issue cert and reload nginx only (no rebuild)
#   bash tailscale-setup.sh --cron      # Install/update root cron job only
#
# HTTPS is switched on by setting TLS_HOSTNAME in the root .env. The frontend
# container's docker-entrypoint.d/40-select-tls.sh then renders the HTTPS nginx
# template using the cert in /etc/tailscale/certs. No nginx file is edited.
#   bash tailscale-setup.sh --help      # Print usage and exit
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
  printf "  ${BOLD}Family Organizer — Tailscale HTTPS Setup${RESET}\n\n"
  printf "  ${BOLD}Usage:${RESET}\n"
  printf "    bash tailscale-setup.sh             # Full setup (cert + .env + rebuild + cron)\n"
  printf "    bash tailscale-setup.sh --renew     # Re-issue cert and reload nginx only\n"
  printf "    bash tailscale-setup.sh --cron      # Install/update cert renewal cron only\n"
  printf "    bash tailscale-setup.sh --help      # Show this help\n\n"
  printf "  ${BOLD}What this script does:${RESET}\n"
  printf "   • Issues a browser-trusted TLS certificate via Tailscale\n"
  printf "   • Sets TLS_HOSTNAME, APP_BASE_URL and SESSION_SECURE in the root .env\n"
  printf "     (and APP_BASE_URL / SESSION_SECURE in backend/.env)\n"
  printf "   • Rebuilds and starts containers — nginx switches itself to HTTPS\n"
  printf "   • Optionally installs a weekly renewal job in root's crontab\n\n"
}

# ── Parse flags ────────────────────────────────────────────────────────────────
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --renew) MODE="renew" ;;
    --cron)  MODE="cron"  ;;
    --help|-h) print_usage; exit 0 ;;
    *)
      error "Unknown flag: $arg"
      print_usage
      exit 1
      ;;
  esac
done

ENV_FILE="backend/.env"
ROOT_ENV=".env"

# ── Ensure we're in the repo root ─────────────────────────────────────────────
if [[ ! -f "docker-compose.yml" || ! -d "frontend/nginx" ]]; then
  error "docker-compose.yml / frontend/nginx not found. Run this script from the repo root."
  exit 1
fi

printf "\n"
printf "  ${BOLD}${CYAN}┌─────────────────────────────────────────────┐${RESET}\n"
printf "  ${BOLD}${CYAN}│   Family Organizer — Tailscale HTTPS Setup  │${RESET}\n"
printf "  ${BOLD}${CYAN}└─────────────────────────────────────────────┘${RESET}\n"
printf "\n"

# ── Tailscale install helper ───────────────────────────────────────────────────
install_tailscale() {
  printf "\n  ${BOLD}Installing Tailscale…${RESET}\n"

  if [[ "${OSTYPE:-}" == darwin* ]]; then
    if command -v brew &>/dev/null; then
      brew install tailscale
    else
      error "Homebrew is not installed. Install Tailscale manually and re-run:"
      printf "    https://tailscale.com/download\n\n"
      exit 1
    fi
  else
    # Linux / WSL2 — official one-line installer
    if command -v curl &>/dev/null; then
      curl -fsSL https://tailscale.com/install.sh | sh
    elif command -v wget &>/dev/null; then
      wget -qO- https://tailscale.com/install.sh | sh
    else
      error "Neither curl nor wget found. Install Tailscale manually and re-run:"
      printf "    https://tailscale.com/download\n\n"
      exit 1
    fi
    # Start the daemon
    if command -v systemctl &>/dev/null; then
      sudo systemctl enable --now tailscaled 2>/dev/null || true
    fi
  fi

  success "Tailscale installed."
}

# ── Tailscale registration helper ─────────────────────────────────────────────
register_tailscale() {
  printf "\n  ${BOLD}Registering with Tailscale…${RESET}\n"
  printf "  ${DIM}A URL will appear below — open it in your browser to complete sign-in.${RESET}\n\n"
  sudo tailscale up
  printf "\n"
  success "Tailscale authenticated."
}

# ── Pre-flight checks ──────────────────────────────────────────────────────────
if ! command -v tailscale &>/dev/null; then
  install_tailscale
  register_tailscale
fi
success "Tailscale found: $(tailscale version 2>/dev/null | head -1)"

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
success "Docker detected (using: ${COMPOSE_CMD})"

if ! sudo -n true 2>/dev/null; then
  warn "sudo password may be required for certificate issuance."
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

# ── Hostname detection ─────────────────────────────────────────────────────────
printf "\n  ${BOLD}Detecting Tailscale hostname…${RESET}\n"

TS_HOSTNAME=""

# Try: tailscale status --json parsed with node
if command -v node &>/dev/null; then
  TS_HOSTNAME=$(tailscale status --json 2>/dev/null | node -e "
    let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { const n=JSON.parse(d).Self.DNSName; process.stdout.write(n.replace(/\\.$/,'')); }
      catch(e){ process.exit(1); }
    });
  " 2>/dev/null || true)
fi

# python3 fallback
if [[ -z "$TS_HOSTNAME" ]] && command -v python3 &>/dev/null; then
  TS_HOSTNAME=$(tailscale status --json 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))" \
    2>/dev/null || true)
fi

# Prompt if auto-detect failed
if [[ -z "$TS_HOSTNAME" ]]; then
  warn "Could not auto-detect Tailscale hostname."
  ask "Tailscale hostname (e.g. mymachine.tail411eff.ts.net):"
  read -r TS_HOSTNAME
  TS_HOSTNAME="${TS_HOSTNAME// /}"  # strip any accidental spaces
  if [[ -z "$TS_HOSTNAME" ]]; then
    error "Hostname cannot be empty."
    exit 1
  fi
fi

success "Tailscale hostname: ${BOLD}${TS_HOSTNAME}${RESET}"

# ── Cert paths ─────────────────────────────────────────────────────────────────
CERT_DIR="/etc/tailscale/certs"
CERT_FILE="${CERT_DIR}/${TS_HOSTNAME}.crt"
KEY_FILE="${CERT_DIR}/${TS_HOSTNAME}.key"

# ── Cert renewal cron (root crontab — `tailscale cert` needs root) ────────────
COMPOSE_FILE="$(pwd)/docker-compose.yml"
CRON_LINE="0 3 * * 1  tailscale cert --cert-file ${CERT_FILE} --key-file ${KEY_FILE} ${TS_HOSTNAME} && docker exec \$(docker compose -f ${COMPOSE_FILE} ps -q frontend) nginx -s reload"

cron_installed() { sudo crontab -l 2>/dev/null | grep -qF "tailscale cert"; }

install_cron() {
  # Older versions of this script put the job in the user's crontab, where
  # `tailscale cert` fails without root. Remove that copy.
  if crontab -l 2>/dev/null | grep -qF "tailscale cert"; then
    crontab -l 2>/dev/null | grep -vF "tailscale cert" | crontab -
    info "Removed old cert-renewal entry from your user crontab."
  fi
  if cron_installed; then
    info "Cert renewal cron already present in root's crontab — skipping."
  else
    (sudo crontab -l 2>/dev/null; echo "$CRON_LINE") | sudo crontab -
    success "Cron installed in root's crontab (runs every Monday at 3 AM)."
  fi
}

# ── Install cron only ──────────────────────────────────────────────────────────
if [[ "$MODE" == "cron" ]]; then
  printf "\n  ${BOLD}Installing cert renewal cron job…${RESET}\n"
  install_cron
  printf "\n"
  exit 0
fi

# ── Issue / renew TLS certificate ──────────────────────────────────────────────
printf "\n  ${BOLD}Issuing TLS certificate…${RESET}\n"

sudo mkdir -p "$CERT_DIR"
sudo tailscale cert \
  --cert-file "$CERT_FILE" \
  --key-file  "$KEY_FILE" \
  "$TS_HOSTNAME"
success "Certificate issued at ${CERT_FILE}"

# ── Reload nginx and exit if --renew ──────────────────────────────────────────
if [[ "$MODE" == "renew" ]]; then
  printf "\n  ${BOLD}Reloading nginx…${RESET}\n"
  if FRONTEND_ID=$($COMPOSE_CMD ps -q frontend 2>/dev/null) && [[ -n "$FRONTEND_ID" ]]; then
    docker exec "$FRONTEND_ID" nginx -s reload
    success "nginx reloaded."
  else
    warn "Frontend container not running — skipping nginx reload."
    info  "Start the app first with: ${COMPOSE_CMD} up -d"
  fi
  printf "\n"
  success "Cert renewal complete."
  printf "  ${BOLD}Cert at:${RESET}  ${CERT_FILE}\n\n"
  exit 0
fi

# ── Update root .env ───────────────────────────────────────────────────────────
printf "\n  ${BOLD}Updating ${ROOT_ENV}…${RESET}\n"

touch "$ROOT_ENV"
set_env_var "TLS_HOSTNAME"   "${TS_HOSTNAME}"          "$ROOT_ENV"
set_env_var "APP_BASE_URL"   "https://${TS_HOSTNAME}"  "$ROOT_ENV"
set_env_var "SESSION_SECURE" "true"                    "$ROOT_ENV"
# APP_PORT was replaced by HTTP_PORT / HTTPS_PORT (defaults 80 / 443)
sed -i.bak '/^APP_PORT=/d' "$ROOT_ENV" && rm -f "$ROOT_ENV.bak"

success "Root .env updated."

# ── Update backend/.env ────────────────────────────────────────────────────────
printf "\n  ${BOLD}Updating ${ENV_FILE}…${RESET}\n"

if [[ ! -f "$ENV_FILE" ]]; then
  warn "${ENV_FILE} not found — run 'bash setup.sh' first to create it."
  warn "Skipping backend/.env update."
else
  set_env_var "APP_BASE_URL"   "https://${TS_HOSTNAME}" "$ENV_FILE"
  set_env_var "SESSION_SECURE" "true"                   "$ENV_FILE"
  success "backend/.env updated."
fi

# ── Rebuild containers ─────────────────────────────────────────────────────────
printf "\n  ${BOLD}Rebuilding containers…${RESET}\n"
printf "  ${DIM}(This may take a minute)${RESET}\n\n"

$COMPOSE_CMD down
$COMPOSE_CMD up -d --build

# ── Health check ───────────────────────────────────────────────────────────────
health_check_poll() {
  local url="https://${TS_HOSTNAME}/api/v1/health"
  local max=36 count=0

  printf "\n  ${BOLD}Waiting for the app to become healthy…${RESET}\n"

  while (( count < max )); do
    local status=""
    if command -v curl &>/dev/null; then
      status=$(curl -sk --max-time 5 "$url" 2>/dev/null || true)
    elif command -v wget &>/dev/null; then
      status=$(wget -qO- --timeout=5 "$url" 2>/dev/null || true)
    fi

    if printf '%s' "$status" | grep -q '"status"'; then
      printf "\n"
      printf "  ${BOLD}${GREEN}┌──────────────────────────────────────────────────────┐${RESET}\n"
      printf "  ${BOLD}${GREEN}│   Family Organizer is running over HTTPS!            │${RESET}\n"
      printf "  ${BOLD}${GREEN}└──────────────────────────────────────────────────────┘${RESET}\n"
      return 0
    fi

    printf "  ${DIM}[%2d/%d] Not ready yet, waiting 5s…${RESET}\n" "$(( count + 1 ))" "$max"
    sleep 5
    (( count++ ))
  done

  printf "\n"
  warn "App did not respond within 3 minutes."
  printf "  Check logs with:  ${BOLD}${COMPOSE_CMD} logs -f${RESET}\n"
  return 1
}

health_check_poll

# ── Cron setup ─────────────────────────────────────────────────────────────────
printf "\n  ${BOLD}Cert auto-renewal${RESET}\n"

if cron_installed; then
  info "Cert renewal cron already present in root's crontab — skipping."
else
  ask "Install weekly cert auto-renewal cron (root crontab)? [Y/n]:"
  read -r CRON_ANSWER
  CRON_ANSWER="${CRON_ANSWER:-Y}"
  if [[ ! "${CRON_ANSWER,,}" == "n" ]]; then
    install_cron
  else
    info "Skipped. To install later: make tailscale-cron"
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────────────
printf "\n"
success "Tailscale HTTPS setup complete!"
printf "\n"
printf "  ${BOLD}Your app:${RESET}     ${CYAN}https://${TS_HOSTNAME}${RESET}\n"
printf "  ${BOLD}Certs at:${RESET}     ${CERT_DIR}/\n"
printf "\n"
printf "  ${BOLD}If you use Google Calendar,${RESET} add this Authorised redirect URI in Google Cloud Console:\n"
printf "    ${CYAN}https://${TS_HOSTNAME}/api/v1/integrations/google/callback${RESET}\n"
printf "\n"
printf "  ${DIM}Useful commands:${RESET}\n"
printf "    make tailscale-renew               ${DIM}# re-issue cert + reload nginx${RESET}\n"
printf "    make logs                          ${DIM}# follow live container logs${RESET}\n"
printf "    make status                        ${DIM}# check container health${RESET}\n"
printf "\n"
