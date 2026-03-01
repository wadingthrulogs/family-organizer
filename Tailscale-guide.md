# Tailscale HTTPS Setup Guide

This guide documents every step taken to move the Family Organizer from plain HTTP to HTTPS using a Tailscale-issued TLS certificate. Follow it top to bottom on a fresh machine or use it as a reference when something breaks.

---

## Why bother?

| Without HTTPS | With HTTPS |
|--------------|-----------|
| Browser drops `Secure` cookies → frequent logouts | Sessions persist correctly |
| Push notifications (VAPID) blocked by browser | Push notifications work |
| Credentials travel unencrypted over Tailscale tunnel | Traffic is encrypted end-to-end |

Tailscale issues free, browser-trusted TLS certificates for any machine on your tailnet via its built-in ACME integration. No Certbot, no Let's Encrypt account, no port 80 needed.

---

## Prerequisites

- Tailscale installed and authenticated on the server (`tailscale status` shows the machine)
- Docker + Docker Compose running the Family Organizer stack
- The machine's Tailscale MagicDNS hostname (e.g. `familyorganizer.tail411eff.ts.net`)

---

## Part 1 — Code changes

Four files were modified. Make these changes before doing anything on the server.

### 1a. `frontend/nginx.conf`

Enable TLS on port 443 and point nginx at the certificate files that will be mounted in from the host.

**Before:**
```nginx
server {
    listen 443;
    server_name _;
```

**After:**
```nginx
server {
    listen 443 ssl;
    server_name familyorganizer.tail411eff.ts.net;

    ssl_certificate     /etc/ssl/tailscale/familyorganizer.tail411eff.ts.net.crt;
    ssl_certificate_key /etc/ssl/tailscale/familyorganizer.tail411eff.ts.net.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
```

Everything else in the file (gzip, proxy blocks, SPA fallback, caching) stays the same.

---

### 1b. `docker-compose.yml`

Two changes:

1. Mount the host cert directory into the frontend container (read-only)
2. Change `SESSION_SECURE` default from `false` to `true`

```yaml
services:
  backend:
    environment:
      - SESSION_SECURE=${SESSION_SECURE:-true}   # was: false

  frontend:
    volumes:
      - /etc/tailscale/certs:/etc/ssl/tailscale:ro   # ADD THIS
    ports:
      - '${APP_PORT:-443}:443'
```

---

### 1c. `setup.sh` (was `start.sh`)

The startup script improvements (preserve `APP_BASE_URL`, default to `https://`, read/write
`SESSION_SECURE`) were originally made to `start.sh`, which has since been merged into the
combined `setup.sh` script. The same logic applies there — see `setup.sh` quick-start mode,
lines ~190–220.

---

### 1d. `backend/.env.example`

Updated to reflect that HTTPS is now the default and to document `SESSION_SECURE`:

```bash
# Examples:
#   https://192.168.1.50:4173                       ← LAN IP with self-signed cert
#   https://familyorganizer.tail411eff.ts.net:4173  ← Tailscale MagicDNS (recommended)
APP_BASE_URL=https://localhost:4173

# Required for HTTPS — set to false only on plain HTTP
SESSION_SECURE=true
```

---

## Part 2 — Server-side steps (run once)

These commands run on the Pi/server, not your development machine.

### 2a. Issue the Tailscale certificate

```bash
sudo mkdir -p /etc/tailscale/certs

sudo tailscale cert \
  --cert-file /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.crt \
  --key-file  /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.key \
  familyorganizer.tail411eff.ts.net
```

Confirm the files exist:

```bash
ls -la /etc/tailscale/certs/
```

You should see two files:
- `familyorganizer.tail411eff.ts.net.crt`
- `familyorganizer.tail411eff.ts.net.key`

> **Note:** Tailscale certs expire every ~90 days. See Part 3 for auto-renewal.

---

### 2b. Create the `.env` file

The `.env` file in the project root is what docker-compose reads for variable substitution. Without it, `APP_BASE_URL` defaults to `http://localhost:4173`, which breaks Google OAuth and other things.

```bash
cat > /home/wade/Organizer/.env << EOF
APP_PORT=443
APP_BASE_URL=https://familyorganizer.tail411eff.ts.net
TZ=UTC
SESSION_SECURE=true
EOF
```

---

### 2c. Rebuild and restart the stack

The volume mount requires the containers to be fully recreated (not just restarted):

```bash
cd /home/wade/Organizer
docker compose down
docker compose up -d --build
```

---

### 2d. Verify

```bash
# Should return {"status":"ok","timestamp":"..."}
curl -sk https://familyorganizer.tail411eff.ts.net/api/v1/health

# Confirm APP_BASE_URL is correct inside the backend
docker compose exec backend printenv APP_BASE_URL

# Check nginx started cleanly
docker compose logs frontend | tail -20
```

Open `https://familyorganizer.tail411eff.ts.net/` in a browser — you should see the padlock and a certificate issued by "Tailscale Inc."

---

## Part 3 — Certificate auto-renewal

Tailscale certs expire every ~90 days. Set up a weekly cron job to renew automatically and reload nginx without downtime.

Run `crontab -e` and add:

```cron
0 3 * * 1  tailscale cert \
  --cert-file /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.crt \
  --key-file  /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.key \
  familyorganizer.tail411eff.ts.net \
  && docker exec $(docker compose -f /home/wade/Organizer/docker-compose.yml ps -q frontend) nginx -s reload
```

This runs every Monday at 3 AM, renews the cert if needed, and sends nginx a graceful reload signal — no downtime, no full container restart.

---

## Part 4 — Google OAuth fix

After switching to HTTPS, Google OAuth will fail with:

```
Error 400: redirect_uri_mismatch
```

This happens because:
1. The app now sends `https://...` as the redirect URI
2. Google only accepts redirect URIs that are explicitly whitelisted in the Cloud Console

### Fix — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Click your **OAuth 2.0 Client ID**
4. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   https://familyorganizer.tail411eff.ts.net/api/v1/integrations/google/callback
   ```
5. Click **Save** — changes take up to 5 minutes to propagate

### Fix — backend `.env`

The backend must have the correct `APP_BASE_URL` so it tells Google the right redirect URI. Confirm the `.env` file exists and contains:

```
APP_BASE_URL=https://familyorganizer.tail411eff.ts.net
```

Then restart the backend:

```bash
docker compose up -d backend
```

Verify:

```bash
docker compose exec backend printenv APP_BASE_URL
# Expected: https://familyorganizer.tail411eff.ts.net
```

---

## Part 5 — Bug fixed along the way

### WeatherWidget crashing the dashboard

**Symptom:** Dashboard showed a full-page "Something went wrong" error.

**Cause:** `WeatherWidget.tsx` was doing:
```tsx
const msg = (error as any)?.response?.data?.error || 'Weather unavailable';
```
The backend error shape is `{ "error": { "code": "...", "message": "..." } }`, so `response.data.error` is an **object**. React throws `Objects are not valid as a React child` when it tries to render the object as text, which bubbles up to the global `ErrorBoundary`.

**Fix:**
```tsx
const msg = (error as any)?.response?.data?.error?.message || 'Weather unavailable';
```

This surfaces when `OPENWEATHER_API_KEY` is not set — the weather widget shows a small "Weather unavailable" notice inside its card instead of crashing the whole page.

---

## Quick reference — common commands

```bash
# Check if certs exist on host
ls -la /etc/tailscale/certs/

# Check if certs are visible inside the nginx container
docker compose exec frontend ls -la /etc/ssl/tailscale/

# Check nginx logs
docker compose logs frontend

# Check backend env
docker compose exec backend printenv | grep -E 'APP_BASE|SESSION|GOOGLE'

# Re-issue cert manually
sudo tailscale cert \
  --cert-file /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.crt \
  --key-file  /etc/tailscale/certs/familyorganizer.tail411eff.ts.net.key \
  familyorganizer.tail411eff.ts.net

# Reload nginx after cert renewal (no container restart)
docker exec $(docker compose ps -q frontend) nginx -s reload

# Full rebuild
docker compose down && docker compose up -d --build
```
