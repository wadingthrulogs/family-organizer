# Tailscale HTTPS Guide

Tailscale gives every machine on your tailnet a stable MagicDNS hostname and a free, browser-trusted TLS certificate — no port-forwarding, no Let's Encrypt, no dynamic DNS required. This guide covers the full setup, certificate renewal, and troubleshooting for Family Organizer.

---

## Prerequisites

- A free [Tailscale account](https://tailscale.com/) (personal accounts are free for up to 3 users / 100 devices)
- The host machine must be running **Linux, macOS, or WSL2** — Windows native is not supported
- Docker and Docker Compose installed on the host
- Family Organizer already bootstrapped via `bash setup.sh`

The setup script will install Tailscale for you if it isn't already present. If you'd rather install it manually first:

```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# macOS
brew install tailscale
sudo tailscale up
```

---

## Setup

Run from the repo root after completing the initial `setup.sh`:

```bash
bash tailscale-setup.sh
```

The script runs fully unattended and handles everything in order:

| Step | What happens |
|------|-------------|
| 1 | Checks that `tailscale`, `docker`, and `docker compose` are available |
| 2 | Installs Tailscale if missing (apt / yum / pacman / brew depending on platform) |
| 3 | Detects your MagicDNS hostname via `tailscale status --json` (e.g. `mymachine.tail411eff.ts.net`) |
| 4 | Issues a TLS certificate: `sudo tailscale cert` → `/etc/tailscale/certs/{hostname}.crt` + `.key` |
| 5 | Patches `frontend/nginx.conf` — changes `listen 80` to `listen 443 ssl`, sets `server_name` to your hostname, and adds `ssl_certificate` directives |
| 6 | Updates `.env` and `backend/.env` — sets `APP_PORT=443`, `APP_BASE_URL=https://{hostname}`, `SESSION_SECURE=true` |
| 7 | Rebuilds and restarts containers: `docker compose down && docker compose up -d --build` |
| 8 | Polls `https://{hostname}/api/v1/health` every 5 s (up to 3 min) and prints your final URL when it responds |
| 9 | Optionally installs a weekly auto-renewal cron (you'll be prompted) |

When it finishes, open `https://<your-hostname>` — you should see the padlock.

---

## Files Modified by the Script

| File | What changes |
|------|-------------|
| `frontend/nginx.conf` | `listen 443 ssl`, `server_name <hostname>`, SSL cert + key directives |
| `.env` | `APP_PORT=443`, `APP_BASE_URL=https://<hostname>`, `SESSION_SECURE=true` |
| `backend/.env` | Same `APP_BASE_URL` and `SESSION_SECURE` values |
| `/etc/tailscale/certs/` | New `<hostname>.crt` and `<hostname>.key` certificate files |

The `docker-compose.yml` already mounts `/etc/tailscale/certs` into the frontend container as `/etc/ssl/tailscale` (read-only), so no compose changes are needed.

---

## Post-Setup: Google Calendar OAuth

If you use Google Calendar integration, you need to add your new HTTPS redirect URI in the Google Cloud Console — the old `http://` URI won't work after switching to HTTPS.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Click your OAuth 2.0 client → **Authorised redirect URIs**
3. Add:
   ```
   https://<your-hostname>/api/v1/integrations/google/callback
   ```
4. Click **Save**

> **Tip:** Open **Settings → Server Configuration** in the app — the Google OAuth section shows the exact redirect URI pre-filled with your current `APP_BASE_URL`.

---

## Certificate Renewal

Tailscale certificates are valid for approximately 90 days. The script offers two renewal options:

### Manual renewal (no downtime)

```bash
bash tailscale-setup.sh --renew
```

Re-issues the certificate and reloads nginx. Containers are **not** rebuilt.

### Automatic renewal via cron

```bash
bash tailscale-setup.sh --cron
```

Installs (or updates) a cron job that runs every **Monday at 3 AM**:

```
0 3 * * 1  tailscale cert ... && docker exec <frontend> nginx -s reload
```

This reloads nginx in-place with the new cert — zero downtime, no container restart.

You can install the cron during initial setup too — the script will prompt you at the end of the full setup run.

---

## Re-running After a Hostname Change

If your Tailscale hostname changes (e.g. you renamed the machine or moved to a different tailnet), just re-run the full script:

```bash
bash tailscale-setup.sh
```

It re-detects the current hostname, re-issues the cert, re-patches nginx, updates the env files, and rebuilds.

---

## Troubleshooting

**`tailscale cert` fails with "not logged in" or permission error**
- Run `tailscale status` to confirm the machine is connected to your tailnet
- You may need to run `sudo tailscale up` first
- The cert command requires `sudo`; make sure the user running the script has sudo access

**nginx container won't start after the script runs**
```bash
docker compose logs frontend
```
The most common cause is a cert path mismatch. Confirm:
- `/etc/tailscale/certs/<hostname>.crt` and `.key` exist on the host
- `nginx.conf` references `/etc/ssl/tailscale/<hostname>.crt` (the container-internal path)

**Health check times out (script waits 3 min then exits)**
```bash
make logs        # or: docker compose logs -f
```
The backend may still be running migrations on first start. Wait a moment and open the URL manually. Also verify `APP_BASE_URL` in `backend/.env` matches the actual hostname exactly.

**Push notifications stopped working after switching to HTTPS**
Push subscriptions are origin-bound — an `http://` subscription is not valid for an `https://` origin. Each family member needs to re-subscribe:
1. Open the app in the browser
2. Go to **Settings → Push Notifications** and click **Enable notifications**

**Google OAuth redirect mismatch error**
You'll see this if the `http://` redirect URI is still the only one registered. Add the new `https://` URI as described in [Post-Setup: Google Calendar OAuth](#post-setup-google-calendar-oauth) above.

**WSL2: cert issued but can't reach the URL from Windows**
The cert is issued for the WSL2 VM's Tailscale hostname. To access the app from Windows:
- Use the full Tailscale hostname in the browser: `https://<hostname>`
- Make sure the Tailscale client is running on both the WSL2 VM and Windows (or just WSL2 with subnet routing)

**Reverting to HTTP**
If you need to go back to plain HTTP temporarily:
1. Restore the original `frontend/nginx.conf` from git: `git checkout frontend/nginx.conf`
2. Set `APP_PORT=80`, `APP_BASE_URL=http://localhost:80`, `SESSION_SECURE=false` in both `.env` files
3. Run `make restart`

---

## Reference

| Command | What it does |
|---------|-------------|
| `bash tailscale-setup.sh` | Full setup: install, cert, nginx, env, rebuild |
| `bash tailscale-setup.sh --renew` | Renew cert + reload nginx (no rebuild) |
| `bash tailscale-setup.sh --cron` | Install/update the weekly renewal cron only |
| `bash tailscale-setup.sh --help` | Show usage |
| `make restart` | Restart containers after manual env changes |
| `make logs` | Follow live container logs |
| `tailscale status` | Show tailnet connection status and hostname |
