#!/bin/sh
# Picks the nginx site config at container start.
#
#   HTTPS — when TLS_HOSTNAME is set and its cert/key exist in $CERT_DIR, or
#           when TLS_HOSTNAME is unset and $CERT_DIR holds exactly one
#           <host>.crt / <host>.key pair (the layout tailscale-setup.sh writes).
#   HTTP  — otherwise.
#
# Runs from the official nginx image's /docker-entrypoint.d/ hook.
set -eu

CERT_DIR="${CERT_DIR:-/etc/ssl/tailscale}"
TEMPLATE_DIR="${TEMPLATE_DIR:-/etc/nginx/fo-templates}"
OUT="${OUT:-/etc/nginx/conf.d/default.conf}"
host="${TLS_HOSTNAME:-}"

log() { echo "40-select-tls: $*"; }

if [ -z "$host" ] && [ -d "$CERT_DIR" ]; then
  # Auto-detect: exactly one *.crt with a matching *.key.
  count=0
  for crt in "$CERT_DIR"/*.crt; do
    [ -e "$crt" ] || continue
    candidate="$(basename "$crt" .crt)"
    if [ -e "$CERT_DIR/$candidate.key" ]; then
      count=$((count + 1))
      found="$candidate"
    fi
  done
  if [ "$count" -eq 1 ]; then
    host="$found"
    log "auto-detected certificate for $host"
  elif [ "$count" -gt 1 ]; then
    log "multiple certificates in $CERT_DIR; set TLS_HOSTNAME to choose one"
  fi
fi

if [ -n "$host" ] && [ -r "$CERT_DIR/$host.crt" ] && [ -r "$CERT_DIR/$host.key" ]; then
  TLS_HOSTNAME="$host" envsubst '${TLS_HOSTNAME}' < "$TEMPLATE_DIR/https.conf.template" > "$OUT"
  log "HTTPS mode for $host (port 80 redirects to 443)"
else
  if [ -n "$host" ]; then
    log "WARNING: TLS_HOSTNAME=$host but $CERT_DIR/$host.crt/.key not found; falling back to HTTP"
  fi
  cp "$TEMPLATE_DIR/http.conf.template" "$OUT"
  log "HTTP mode on port 80"
fi
