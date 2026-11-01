# Security Policy

## Reporting a Vulnerability

If you find a security issue in Family Organizer, please **do not open a public GitHub issue**. Report it privately:

- **GitHub:** [Private Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository
- **Email:** send details to the maintainer directly (see profile contact info)

Please include:
- A description of the issue and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations

You can expect an acknowledgment within **48 hours** and a status update within **7 days**.

---

## Scope

Family Organizer is a **single-household**, self-hosted app: every signed-in user belongs to the same household and can see shared household data.

**In scope:**
- Authentication and session handling flaws (login, session cookies, registration bootstrap)
- Privilege escalation to `ADMIN` (admin-only: user management, backup export/import, task cleanup, notification processing, server configuration)
- Reading or changing data without a valid session
- Leaking stored secrets (OAuth tokens, SMTP password, VAPID private key, API keys) — these are encrypted at rest with `ENCRYPTION_KEY` and never returned by the API
- Input validation bypasses, path traversal, or unsafe file handling in uploads (attachments, recipe photos)

**Out of scope:**
- Issues requiring physical access to the host
- Self-hosted misconfiguration (e.g. exposing the app to the public internet without TLS)
- Denial of service against a LAN / tailnet deployment
- Differences between `MEMBER` and `VIEWER`: apart from guest-display content (`PATCH /guest/content`, `POST /guest/books/:id/lookup`) and switching the wall display (`PATCH /settings/display`), which require `ADMIN` or `MEMBER`, members and viewers intentionally have the same access
- Findings in third-party dependencies — please report those upstream

---

## Hardening Notes for Operators

- **Use HTTPS** ([Tailscale-guide.md](Tailscale-guide.md)) and set `SESSION_SECURE=true`. Keep the app on your LAN or tailnet; there's no need to port-forward it.
- **Protect `.env` and `backend/.env`.** They hold `SESSION_SECRET` and `ENCRYPTION_KEY`. Losing `ENCRYPTION_KEY` makes stored secrets unreadable, and leaking it exposes them. Both files are git-ignored.
- **Backups contain everything.** `make backup` copies the whole SQLite database (password hashes, encrypted secrets, all household data). The in-app JSON export (admin-only) contains user records. Store both privately.
- **Registration closes after the first user.** That first account becomes `ADMIN`, so create it right after install.
- **MCP server credentials** ([mcp/README.md](mcp/README.md)). The MCP server logs in as a normal user. Give it a dedicated `MEMBER` account (e.g. `claude-bot`), not an admin. Keep its password out of committed files (`.mcp.json` is local config). In HTTP mode, always set `MCP_HTTP_BEARER` and keep `MCP_HTTP_HOST=127.0.0.1` unless you need remote access.
- **Recipe-photo watcher** ([tools/recipe-image-watcher](tools/recipe-image-watcher/README.md)). It runs Claude Code on the host as your user, with your Claude subscription login, on images uploaded through the app. The backend only exchanges files with it through two host folders. Keep those folders owned by that user, and remember anyone who can sign in to the app can submit images. The watcher refuses to run if `ANTHROPIC_API_KEY` is set, so it can't bill an API account by accident.
- **Uploaded photos keep their metadata.** Attachments and recipe photos are stored as uploaded. Phone photos often include EXIF GPS location, so avoid sharing the uploads volume or committing files from it.

---

## Supported Versions

This project is in early development. Only the latest code on `main` gets security fixes.

---

## Disclosure Policy

Once a fix is available, the vulnerability is disclosed in the GitHub advisory and noted in `CHANGELOG.md`. We follow a **90-day coordinated disclosure** window.
