# Family Organizer

I created this app after seeing some friends get Magic Mirror and DAKboard. I didn't want to pay a subscription, I wanted something self-hosted with all the features, and I thought it would make a fun AI coding project. This is meant to run on a Raspberry Pi or Linux host, but since it runs in containers, it can also run on a Windows host. 

Requriments - 
* [Open Weather Map API Key](https://openweathermap.org/api)
* [Gmail Oauth app for your google calander ](https://developers.google.com/identity/protocols/oauth2)
Optional 
* [Tailscale account](https://tailscale.com/)

I am still working on the reminders and notifications tabs. 

---

## Features
- **Dashboard** — Drag-and-resize widget grid, 16 themes
- **Calendar** — Google Calendar sync, day/week/month views, manual events
- **Tasks** — Simple todo list with quick-add, open/closed status, assignees, due dates, and recurrence
- **Chores** — Rotation scheduling (round-robin / weighted / manual), streaks, reward points
- **Grocery Lists** — Shopping mode, bulk add, low-stock auto-populate
- **Inventory** — Pantry tracker with low-stock thresholds and export
- **Reminders** — Web push and email notifications with configurable lead times
- **Multi-user** — Role-based access (Admin / Member / Viewer), per-user colors


![alt text](family_organizer-1.gif)


## Quick Start

```bash
git clone https://github.com/your-org/family-organizer.git
cd family-organizer
chmod +x setup.sh
bash setup.sh
```

The wizard generates secrets, writes `backend/.env`, and builds and starts the app.

**Windows users:** Run in WSL2.
**Default URL:** `http://localhost:80`. The setup wizard will show the exact URL.
**After setup:** The script will display the app URL and a direct link to `/register` — open it to create your admin account.
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
     - `http://localhost:80/api/v1/integrations/google/callback` *(initial setup)*
     - `https://familyorganizer.tail411eff.ts.net/api/v1/integrations/google/callback` *(Tailscale HTTPS)*
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
Certbot, no Let's Encrypt, no port-forwarding needed. HTTPS is required for secure session
cookies and browser push notifications.

### What `tailscale-setup.sh` does automatically

Run it from the repo root:

```bash
bash tailscale-setup.sh
```

The script handles everything in order:

1. **Installs Tailscale** on the host if not already installed (Linux/macOS/WSL2)
2. **Detects your Tailscale MagicDNS hostname** (e.g. `mymachine.tail411eff.ts.net`) from `tailscale status`
3. **Issues a TLS certificate** via `tailscale cert` and saves it to `/etc/tailscale/certs/`
4. **Patches `frontend/nginx.conf`** — switches `listen 80` to `listen 443 ssl`, sets `server_name` to your hostname, and adds the `ssl_certificate` directives
5. **Updates `.env` and `backend/.env`** — sets `APP_BASE_URL=https://<hostname>`, `APP_PORT=443`, and `SESSION_SECURE=true`
6. **Rebuilds and restarts containers** — runs `docker compose down && docker compose up -d --build`
7. **Polls the health endpoint** until the app responds over HTTPS
8. **Optionally installs a weekly cron** to renew the certificate and reload nginx without downtime

After the script finishes, open `https://<your-hostname>` — you should see the padlock.

### What you still need to do manually

**If you use Google Calendar**, update your OAuth redirect URI in Google Cloud Console:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Click your OAuth client → **Authorised redirect URIs**
3. Add:
   ```
   https://<your-hostname>/api/v1/integrations/google/callback
   ```
4. Click **Save**

> **Tip:** Open **Settings → Server Configuration** in the app — the Google OAuth section shows the exact URIs you need to register, pre-filled with your current `APP_BASE_URL`.

### Re-running and renewal

```bash
bash tailscale-setup.sh --renew   # Re-issue cert + reload nginx (no rebuild)
bash tailscale-setup.sh --cron    # Install/update the weekly renewal cron only
```

The setup script (`bash setup.sh`) preserves your Tailscale hostname across restarts and will not overwrite a configured `APP_BASE_URL`.


---

## Development

```bash
# Backend (port 3000)
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev

# Frontend (port 80, Vite dev server) — separate terminal
cd frontend
npm install
npm run dev
```

> **Note:** Port 80 is the Vite dev server used during development.
> The Docker deployment (nginx) uses port **443** (HTTPS) by default.
>
> **Windows note:** Port 80 requires elevated privileges. If `npm run dev` fails with `EACCES` or `permission denied`, run your terminal as Administrator.

The Vite dev server proxies `/api` to `http://localhost:3000` automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node 20, TypeScript, Express 4, Prisma 5, SQLite |
| Auth | express-session, bcrypt |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Drag & drop | react-grid-layout (dashboard) |
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
