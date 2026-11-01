# Tailscale HTTPS Guide

Tailscale gives every machine on your tailnet a stable MagicDNS hostname and a free, browser-trusted TLS certificate — no port-forwarding, no Let's Encrypt, no dynamic DNS. This guide covers setup, certificate renewal, and troubleshooting for Family Organizer.

HTTPS matters here: browsers only allow web push on HTTPS, and `SESSION_SECURE=true` cookies need it.

---

## How HTTPS works in this app

Nothing in the repo is edited to turn HTTPS on. The nginx container chooses its mode every time it starts (`frontend/docker-entrypoint.d/40-select-tls.sh`):

1. `TLS_HOSTNAME` is set in the root `.env` **and** `/etc/tailscale/certs/<TLS_HOSTNAME>.crt` + `.key` exist → **HTTPS**
2. otherwise, exactly one `*.crt`/`*.key` pair exists in `/etc/tailscale/certs/` → **HTTPS** with that hostname
3. otherwise → **HTTP**

In HTTPS mode nginx serves the app on 443 (`HTTPS_PORT`) and port 80 (`HTTP_PORT`) returns a `301` to HTTPS (except `/healthz`). `docker-compose.yml` mounts `/etc/tailscale/certs` into the container read-only at `/etc/ssl/tailscale`.

`tailscale-setup.sh` just gets a certificate into that folder and sets the matching `.env` values.

---

## Prerequisites

- A free [Tailscale account](https://tailscale.com/)
- Host running **Linux, macOS, or WSL2** (Windows native isn't supported)
- `sudo` access (certificate issuance writes to `/etc/tailscale/certs`)
- Family Organizer already set up via `bash setup.sh`
- MagicDNS and HTTPS certificates enabled for your tailnet (Tailscale admin console → **DNS** → enable **MagicDNS** and **HTTPS Certificates**)

If Tailscale isn't installed, the script installs it with the official installer (`curl -fsSL https://tailscale.com/install.sh | sh` on Linux/WSL2, `brew install tailscale` on macOS) and runs `sudo tailscale up`. To do it yourself first:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Setup

From the repo root:

```bash
bash tailscale-setup.sh     # or: make tailscale-setup
```

| Step | What happens | Interaction |
|------|-------------|-------------|
| 1 | Installs Tailscale if missing, then `sudo tailscale up` | Open the printed login URL in a browser |
| 2 | Checks Docker / Docker Compose | — |
| 3 | Detects the MagicDNS hostname from `tailscale status --json` (e.g. `mymachine.tail411eff.ts.net`) | Asks for it only if auto-detect fails |
| 4 | `sudo tailscale cert` → `/etc/tailscale/certs/<hostname>.crt` + `.key` | `sudo` password |
| 5 | Sets `TLS_HOSTNAME=<hostname>`, `APP_BASE_URL=https://<hostname>`, `SESSION_SECURE=true` in the root `.env`, and `APP_BASE_URL`/`SESSION_SECURE` in `backend/.env` | — |
| 6 | Rebuilds and recreates the containers (`make up`) | — |
| 7 | Polls the health endpoint every 5 s (up to 3 min) and prints the final URL | — |
| 8 | Offers to install a weekly renewal cron job in root's crontab | `Y/n` |

When it finishes, open `https://<your-hostname>` — you should see the padlock. Check the mode nginx picked with:

```bash
docker compose logs frontend | grep -i mode
```

### What gets changed

| Location | Change |
|----------|--------|
| `/etc/tailscale/certs/` | `<hostname>.crt` and `<hostname>.key` |
| `.env` | `TLS_HOSTNAME`, `APP_BASE_URL=https://<hostname>`, `SESSION_SECURE=true` |
| `backend/.env` | `APP_BASE_URL`, `SESSION_SECURE` |
| root crontab | renewal job (only if you accept) |

No tracked files in the repo are modified, so `git pull` / `make update` won't conflict.

---

## Post-Setup: Google Calendar OAuth

The `http://` redirect URI stops working after switching to HTTPS. Add the new one:

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Your OAuth client → **Authorised redirect URIs** → add
   ```
   https://<your-hostname>/api/v1/integrations/google/callback
   ```
3. **Save**

> **Settings → Server Configuration** in the app shows the exact redirect URI the backend is using.

## Post-Setup: Push notifications

Push subscriptions are tied to the origin. After switching to HTTPS, each person opens the app at the new `https://` URL and enables notifications again on the **Notifications** page.

---

## Certificate Renewal

Tailscale certificates last about 90 days.

### Manual (no downtime)

```bash
bash tailscale-setup.sh --renew     # or: make tailscale-renew
```

Re-issues the certificate and runs `nginx -s reload` in the running frontend container. No rebuild.

### Automatic (cron)

```bash
bash tailscale-setup.sh --cron      # or: make tailscale-cron
```

Installs (or keeps) a job in **root's** crontab — `tailscale cert` needs root to write `/etc/tailscale/certs` — that runs every **Monday at 03:00**:

```
0 3 * * 1  tailscale cert --cert-file /etc/tailscale/certs/<host>.crt --key-file /etc/tailscale/certs/<host>.key <host> && docker exec <frontend> nginx -s reload
```

Check it with `sudo crontab -l`. Older versions of the script put the job in your *user* crontab, where it couldn't write the cert directory; running `--cron` (or the full setup) now removes that old entry automatically.

---

## Re-running After a Hostname Change

If the machine is renamed or moves to another tailnet, run the full script again. It issues a new certificate and updates `TLS_HOSTNAME`/`APP_BASE_URL`. Remove the old `<old-hostname>.crt`/`.key` from `/etc/tailscale/certs/` too: with `TLS_HOSTNAME` set it doesn't matter, but leftover pairs break the single-cert auto-detection.

Remember to update the Google OAuth redirect URI.

---

## Reverting to HTTP

1. In the root `.env`: delete `TLS_HOSTNAME`, set `APP_BASE_URL=http://<host-or-ip>` and `SESSION_SECURE=false` (same two in `backend/.env`)
2. Move the certificate pair out of `/etc/tailscale/certs/` (otherwise nginx auto-detects it and stays in HTTPS mode):
   ```bash
   sudo mkdir -p /etc/tailscale/certs.disabled
   sudo mv /etc/tailscale/certs/*.crt /etc/tailscale/certs/*.key /etc/tailscale/certs.disabled/
   ```
3. Remove the renewal job: `sudo crontab -e`
4. `make up`

---

## Troubleshooting

**`tailscale cert` fails ("not logged in", permission, or "HTTPS not enabled")**
- `tailscale status` — is the machine connected?
- Enable **HTTPS Certificates** in the tailnet DNS settings
- The command runs under `sudo`; make sure your user can sudo

**Browser shows "connection refused" on https, or the page redirects to HTTP**
nginx is in HTTP mode. `docker compose logs frontend | grep -i mode`, then check:
- `ls -l /etc/tailscale/certs/` — `<TLS_HOSTNAME>.crt` and `.key` exist and the name matches `TLS_HOSTNAME` exactly
- you ran `make up` (not `make restart`) after changing `.env`

**Frontend won't start: `bind: address already in use` / `port is already allocated` on :80**
Something else on the host listens on port 80 (another nginx, a Pi-hole, a dev server). Bind the redirect listener elsewhere, e.g. `HTTP_PORT=127.0.0.1:8080` in the root `.env`, then `make up`. HTTPS on 443 is unaffected.

**Redirected to https but it never loads**
`HTTPS_PORT` is taken by another service or blocked by a firewall. `docker compose ps` should show `0.0.0.0:443->443/tcp`.

**Health check times out (script gives up after 3 min)**
The first build on a Pi can be slow and migrations run on first start. Run `make logs`, wait, then open the URL manually.

**`401` on every request after switching**
`APP_BASE_URL` in the root `.env` doesn't match the URL in the browser, or you're still on `http://` with `SESSION_SECURE=true`.

**Google OAuth `redirect_uri_mismatch`**
Add the `https://` redirect URI as described above.

**WSL2: cert issued but Windows can't reach it**
The cert is for the WSL2 VM's Tailscale name. Use `https://<hostname>` from a device on the tailnet, and make sure Tailscale is running inside WSL2.

---

## Reference

| Command | What it does |
|---------|-------------|
| `bash tailscale-setup.sh` / `make tailscale-setup` | Full setup: install, cert, env, rebuild, optional cron |
| `bash tailscale-setup.sh --renew` / `make tailscale-renew` | Renew cert + reload nginx (no rebuild) |
| `bash tailscale-setup.sh --cron` / `make tailscale-cron` | Install the weekly renewal cron only |
| `bash tailscale-setup.sh --help` | Usage |
| `make up` | Apply `.env` changes (recreates containers) |
| `make logs` | Follow container logs |
| `tailscale status` | Tailnet connection status and hostname |
