# Family Organizer

Self-hosted household management — tasks, chores, grocery lists, inventory, calendar, and reminders for the whole family.

---

## Features

- **Tasks** — Kanban board with assignments, priorities, due dates, recurrence, and history
- **Chores** — Rotation scheduling (round-robin / weighted / manual), streaks, reward points
- **Grocery Lists** — Shopping mode, bulk add, low-stock auto-populate
- **Inventory** — Pantry tracker with low-stock thresholds and export
- **Calendar** — Google Calendar sync, day/week/month views, manual events
- **Reminders** — Web push and email notifications with configurable lead times
- **Dashboard** — Drag-and-resize widget grid, 16 themes
- **Multi-user** — Role-based access (Admin / Member / Viewer), per-user colors

---

## Quick Start

```bash
git clone https://github.com/your-org/family-organizer.git
cd family-organizer
chmod +x setup.sh
bash setup.sh
```

The wizard generates secrets, detects your local IP, asks about optional features,
writes `backend/.env`, and optionally builds and starts the app.

**Windows users:** Run in WSL2.
**Default URL:** `https://<your-lan-ip>:443` (Docker, nginx, HTTPS). The setup wizard will show the exact URL.
**After setup:** Open the URL shown in the terminal and go to `/register` to create your admin account.
**Reconfigure:** Most settings (API keys, SMTP, push notifications, weather) can be changed via **Settings → Server Configuration** in the app (admin only). For core server config (`SESSION_SECRET`, `DATABASE_URL`, ports), edit `backend/.env` then `make restart`.

Full guide: [docs/deployment.md](docs/deployment.md)

---

## Post-Setup Configuration

After the initial setup, most optional settings can be changed **directly in the app** without
editing files or restarting the server. Log in as an admin and go to **Settings**.

### Configurable via Settings UI (Admin → Server Configuration)

| Setting | UI Label |
|---------|----------|
| OpenWeatherMap API key | Weather → API Key |
| SMTP host, port, user, password, from address | Email → SMTP |
| Web push VAPID keys | Push Notifications → VAPID Keys |
| Google OAuth client ID & secret | Google Calendar → Credentials |
| App base URL | Server → App Base URL *(restart required)* |

Sensitive values (secrets, passwords, VAPID keys) are encrypted at rest in the database.
The UI shows a "configured" badge instead of revealing stored values.

### Still requires `backend/.env` + `make restart`

These are foundational settings that must be present at startup:

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Cookie signing key (≥16 chars) |
| `ENCRYPTION_KEY` | Secret encryption key (≥32 chars) |
| `DATABASE_URL` / `SQLITE_PATH` | Database file location |
| `PORT` | Server port |
| `NODE_ENV` | Runtime environment |
| `GOOGLE_REDIRECT_URL` | OAuth callback (must match Google Console) |

---

## Common Commands

| Command | What it does |
|---------|-------------|
| `make up` | Start the app |
| `make down` | Stop the app |
| `make restart` | Restart containers |
| `make logs` | Follow live logs |
| `make status` | Show container health |
| `make backup` | Save timestamped DB backup to `./backups/` |
| `make restore FILE=path` | Restore DB from backup |
| `make update` | Pull latest code and rebuild |

---

## Google Calendar Integration (optional)

To sync Google Calendars, you need a free OAuth 2.0 client from Google Cloud.

### 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown (top-left) → **New Project**
3. Give it a name (e.g. `Family Organizer`) and click **Create**

### 2. Enable the Google Calendar API

1. In the left sidebar go to **APIs & Services → Library**
2. Search for **Google Calendar API** and click it
3. Click **Enable**

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. If prompted, configure the **OAuth consent screen** first:
   - User type: **External** → fill in app name and your email → save
4. Back on Create OAuth client ID:
   - Application type: **Web application**
   - Name: anything (e.g. `Family Organizer`)
   - Under **Authorised redirect URIs**, click **Add URI** and enter:
     ```
     <APP_BASE_URL>/api/v1/integrations/google/callback
     ```
     Replace `<APP_BASE_URL>` with your actual URL from setup.
     Examples:
     - `https://192.168.1.50:443/api/v1/integrations/google/callback`
     - `https://familyorganizer.tail411eff.ts.net/api/v1/integrations/google/callback`
5. Click **Create** — a dialog will show your **Client ID** and **Client Secret**

### 4. Add the Credentials to `backend/.env`

Open `backend/.env` and fill in these two lines:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

`GOOGLE_REDIRECT_URL` can be left blank — it is derived automatically from `APP_BASE_URL`.

Then restart the app:

```bash
make restart
```

### 5. Connect Your Google Account

Log in to Family Organizer → **Settings → Google Calendar** → **Connect Google Account**.
After authorising, your calendars will appear under **Settings → Google Calendar** to enable sync.

---

## Tailscale HTTPS (Recommended)

Tailscale issues free, browser-trusted TLS certificates for any machine on your tailnet — no
Certbot, no Let's Encrypt, no port 80 needed. HTTPS is required for secure session cookies and
browser push notifications.

> **Automated:** Run `bash tailscale-setup.sh` (or `make tailscale-setup`) to complete all steps
> below automatically. Manual steps are kept below as reference.

### 1. Install Tailscale and get your hostname

Install Tailscale on the server and note the MagicDNS hostname:

```bash
tailscale status   # e.g. familyorganizer.tail411eff.ts.net
```

### 2. Issue the certificate

```bash
sudo mkdir -p /etc/tailscale/certs
sudo tailscale cert \
  --cert-file /etc/tailscale/certs/<your-hostname>.crt \
  --key-file  /etc/tailscale/certs/<your-hostname>.key \
  <your-hostname>
```

### 3. Configure the app

Set your Tailscale hostname as `APP_BASE_URL` in the root `.env`:

```env
APP_PORT=443
APP_BASE_URL=https://<your-hostname>
SESSION_SECURE=true
```

The setup script (`bash setup.sh`) preserves this URL across reboots — it will not overwrite a
configured hostname with the detected LAN IP.

### 4. Rebuild

```bash
docker compose down && docker compose up -d --build
```

Open `https://<your-hostname>` — you should see the padlock.

### 5. Update Google OAuth redirect URI

If you use Google Calendar, add the new HTTPS callback URI in
[Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials →
your OAuth client → Authorised redirect URIs:

```
https://<your-hostname>/api/v1/integrations/google/callback
```

### Certificate auto-renewal

Tailscale certs expire every ~90 days. Add a weekly cron to renew without downtime:

```cron
0 3 * * 1  tailscale cert \
  --cert-file /etc/tailscale/certs/<your-hostname>.crt \
  --key-file  /etc/tailscale/certs/<your-hostname>.key \
  <your-hostname> \
  && docker exec $(docker compose -f /path/to/Organizer/docker-compose.yml ps -q frontend) nginx -s reload
```

Full details and troubleshooting: [Tailscale-guide.md](Tailscale-guide.md)

---

## Development

```bash
# Backend (port 3000)
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev

# Frontend (port 5173, Vite dev server) — separate terminal
cd frontend
npm install
npm run dev
```

> **Note:** Port 5173 is the Vite dev server used during development.
> The Docker deployment (nginx) uses port **443** (HTTPS) by default.

The Vite dev server proxies `/api` to `http://localhost:3000` automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node 20, TypeScript, Express 4, Prisma 5, SQLite |
| Auth | express-session, bcrypt |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Drag & drop | @dnd-kit, react-grid-layout |
| Deployment | Docker Compose, Nginx |

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/deployment.md](docs/deployment.md) | Full deployment guide — Docker, reverse proxy, env vars, backups |
| [docs/architecture.md](docs/architecture.md) | System architecture overview |
| [docs/api.md](docs/api.md) | API endpoint reference |
| [Tailscale-guide.md](Tailscale-guide.md) | HTTPS setup via Tailscale — certs, renewal, Google OAuth fix |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## License

[MIT](LICENSE)
