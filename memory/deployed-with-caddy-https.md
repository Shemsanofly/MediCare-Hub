---
name: deployed-with-caddy-https
description: Production deployment is live on agent01.overssh.com via Caddy with automatic HTTPS.
metadata:
  type: project
---

As of 2026-06-13 the MediCare Hub app is deployed and reachable at **https://agent01.overssh.com**.

**Why:** User asked to put the app behind a reverse proxy on the domain pointing to the machine.

**How to apply / maintain:**
- Caddy (`caddy.service`) handles HTTPS with automatic Let's Encrypt certificates.
- Caddy serves the React production build from `frontend/dist` and reverse-proxies `/api/v1/*` to the Express backend on `127.0.0.1:8000`.
- Backend runs as `medicare-hub-backend.service` (systemd) using Node from `/home/agent/.nvm/versions/node/v24.16.0/bin/node`.
- Useful commands:
  - `sudo systemctl status medicare-hub-backend`
  - `sudo systemctl status caddy`
  - `sudo systemctl restart medicare-hub-backend`
  - `sudo systemctl reload caddy`
- After code/frontend changes:
  1. `cd frontend && npm run build`
  2. `sudo systemctl restart medicare-hub-backend`
  3. `sudo systemctl reload caddy` (usually not needed unless Caddyfile changes)

**Important notes:**
- `backend/.env` now has `NODE_ENV=production`, `CORS_ORIGIN=https://agent01.overssh.com`, and a generated `JWT_SECRET`. Keep this file secret.
- The `.env` file is not committed to Git (see `.gitignore`).
- A `python3 -m http.server` was running on port 80 and blocking Caddy; it was stopped. Caddy now owns ports 80 and 443.

**Related:** [[stack-switched-to-express-sqlite]]
