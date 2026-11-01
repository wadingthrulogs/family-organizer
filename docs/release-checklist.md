# Release Checklist

A short runbook for tagging a release, packaging assets, and rolling out the Family Organizer stack.

## 1. Pre-flight Verification
- `cd backend && npm test`, which needs `backend/.env` with `SESSION_SECRET` and `ENCRYPTION_KEY`
- `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`, then `npm run preview` to check for UI regressions
- `cd mcp && npm ci && npm run build`. The build also runs `npm audit` and fails on high-severity issues. Then, from the repo root, run `ORGANIZER_USERNAME=x ORGANIZER_PASSWORD=x node mcp/smoke-test.mjs` to confirm all 15 tools register. It doesn't need a running backend.
- Run the e2e suite against a running stack: `cd e2e && npx playwright test` (see [e2e/README.md](../e2e/README.md))
- Make sure Prisma migrations are committed and `npx prisma migrate deploy` runs cleanly on a copy of the production DB
- Move the `[Unreleased]` section of `CHANGELOG.md` under the new version heading, with today's date
- If routes, models, env vars or widgets changed, check that `README.md`, `CLAUDE.md` and `docs/` match

## 2. Versioning & Tagging
1. Bump `version` in `backend/package.json` and `frontend/package.json` if the release calls for it.
2. Commit the version bump and the CHANGELOG update.
3. Tag the release:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
4. On GitHub, draft a release from the tag and paste in the CHANGELOG section.

## 3. Package Artifacts (optional)
Build these only when you need them, for example for an air-gapped install. Attach them to the GitHub release. **Don't commit them**: `*.tar.gz` is git-ignored.
- Frontend bundle: `cd frontend && npm run build && tar czf ../dist-vX.Y.Z.tar.gz dist`
- Backend:
  ```bash
  cd backend
  npm run build
  tar czf ../backend-dist-vX.Y.Z.tar.gz dist prisma package*.json docker-entrypoint.sh
  ```

## 4. Container Images (optional)
- Build: `docker compose build`. Images are named `<project>-frontend` and `<project>-backend`, where `<project>` is the Compose project name (by default the repo folder, e.g. `family-organizer`).
- Tag and push:
  ```bash
  docker tag family-organizer-frontend registry.local/organizer/frontend:vX.Y.Z
  docker tag family-organizer-backend  registry.local/organizer/backend:vX.Y.Z
  docker push registry.local/organizer/frontend:vX.Y.Z
  docker push registry.local/organizer/backend:vX.Y.Z
  ```
- For reproducible rollouts, point the compose file at these tags instead of the `build:` contexts.

## 5. Deployment
- Back up the database first: `make backup`.
- On the host: `make update` (`git pull` followed by `docker compose up -d --build`). Migrations run automatically when the backend starts.
- Check the result:
  - `make status`: both containers are healthy, and `/api/v1/health` returns `{ "status": "ok" }`.
  - `docker compose logs frontend | grep -i mode`: nginx is in the expected HTTP or HTTPS mode. On a Tailscale host it should say HTTPS.
  - The app loads at `APP_BASE_URL` and shows a padlock if you use HTTPS.
- Volumes: make sure `sqlite_data` and `uploads_data` survived the upgrade. `uploads_data` holds task attachments and dashboard background photos.
- Recipe-photo import, if you use it: `systemctl status recipe-image-watcher` is active, and `RECIPE_UPLOADS_HOST_DIR` and `RECIPE_OUTPUT_HOST_DIR` exist and are owned by the watcher's user, not root.

## 6. Post-Deployment Smoke Test
- Sign in, then check that Dashboard, Tasks, Chores, Grocery, Inventory, Meal Plans, Calendar and Settings all load. Most routes are lazy-loaded.
- Create a task and complete it. For a recurring task, check that the next instance appears.
- Add a grocery item, check it off in shopping mode, then move it to inventory.
- Trigger a reminder (`POST /api/v1/notifications/trigger/:reminderId`, or from the Notifications page) and confirm delivery on each channel you've set up (push, email, webhook).
- Google Calendar: **Settings → Google Calendar → Sync**. Make sure no account shows a sync error.
- Commute widget, if used: the Mapbox token and home address are set in **Settings → Commute**, and `/api/v1/commute/etas/active` returns ETAs for active routes.
- Recipe-photo import, if used: upload a photo of a real recipe from the Inventory page and check that items come back. To test only the watcher, run `node tools/recipe-image-watcher/make-test-image.mjs "$RECIPE_UPLOADS_HOST_DIR/testcard.png"` and check that a `.json` appears in `RECIPE_OUTPUT_HOST_DIR`.
- Open `/kiosk` on the wall display and check it shows the new build. `index.html` is never cached, so a refresh should be enough.
- Watch `make logs` for errors during the first 15 minutes.

## 7. Rollback Plan
- Keep the previous tag handy. To roll back: `git checkout vX.Y.Z-1 && make up`, or switch the compose file back to the previous image tags.
- If a migration broke things, restore the backup taken in step 5: `make restore FILE=./backups/app-<timestamp>.db`.

Write down anything unexpected in `docs/deployment.md` so the next release goes more smoothly.
