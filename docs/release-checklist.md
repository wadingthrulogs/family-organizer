# Release Checklist

A short runbook for tagging the repository, packaging assets, and rolling out the Family Organizer stack.

## 1. Pre-flight Verification
- `cd backend && npm run test`
- `cd frontend && npm run build`
- Manually open `frontend/dist/index.html` (or run `npm run preview`) to spot UI regressions.
- Confirm Prisma migrations are committed and `prisma migrate deploy` runs cleanly.

## 2. Versioning & Tagging
1. Update `package.json` versions (backend + frontend) if the release warrants it.
2. Commit any pending version bumps.
3. Tag the repository:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
4. If using GitHub, draft a release pointing at the new tag. Attach the frontend build artifact (see next step) when desired.

## 3. Package Artifacts
- Frontend bundle: `cd frontend && npm run build && tar czf ../dist-vX.Y.Z.tar.gz dist`
- Optionally zip backend dist + prisma schema for air-gapped installs:
  ```bash
  cd backend
  npm run build
  tar czf ../backend-dist-vX.Y.Z.tar.gz dist prisma package*.json
  ```
- Upload archives to your release or copy them onto the deployment host.

## 4. Container Images (Optional but Recommended)
- Build images locally: `docker compose build`
- Tag and push to registry (example):
  ```bash
  docker tag organizer-frontend registry.local/organizer/frontend:vX.Y.Z
  docker tag organizer-backend registry.local/organizer/backend:vX.Y.Z
  docker push registry.local/organizer/frontend:vX.Y.Z
  docker push registry.local/organizer/backend:vX.Y.Z
  ```
- Update your compose file to reference the new tags instead of `build:` contexts for reproducible rollouts.

## 5. Deployment
- Follow `docs/deployment.md` to provision env vars, volumes, and Docker services.
- Run `docker compose up -d --pull always` (or `--build`) on the target host.
- Verify `GET /api/v1/health` returns `{ status: 'ok' }`. Confirm the frontend loads over HTTPS.
- **Volume check:** confirm the `uploads_data` Docker volume is preserved across upgrades. This volume stores file attachments and dashboard background photos uploaded by users. Losing it removes all uploaded images.

## 6. Post-Deployment Smoke Test
- Sign in with a household user; ensure tasks/chores/grocery views load data.
- Trigger a reminder and verify email/push delivery.
- Create & complete a grocery item while in shopping mode.
- Review logs (`docker compose logs -f backend`) for errors during the first 15 minutes.

## 7. Rollback Plan
- Keep previous images/tags handy (e.g., `vX.Y.Z-1`).
- To rollback: stop services, switch compose file to previous image tags, `docker compose up -d`.
- Restore SQLite backup if schema changes broke the deployment.

Document any anomalies in `docs/deployment.md` or an internal wiki so the next release is smoother.
