# MediCare Hub

MediCare Hub is a Business-to-Business (B2B) healthcare procurement platform that connects hospitals, clinics, pharmacies, and laboratories with verified medical suppliers in Tanzania. Healthcare institutions browse a centralized marketplace, manage carts, place orders, track fulfillment, and make secure payments. Suppliers manage products, inventory batches, and order workflows. Administrators oversee users, supplier verification, products, and platform orders.

## Features

- **JWT authentication** with role-based access (Hospital, Supplier, Admin)
- **Marketplace** — product catalog, search, filters, product detail with stock summary
- **Product CRUD** — verified suppliers create and manage product listings
- **Inventory & batches** — FIFO stock allocation, reservations, expiry tracking, low-stock alerts
- **Cart & checkout** — multi-supplier carts; checkout splits into one order per supplier
- **Order lifecycle** — accept, reject, prepare, ship, deliver, buyer-confirmed completion
- **Supplier comparison** — view a product across suppliers to compare price & rating
- **Supplier KYC** — simulated NIDA identity verification at supplier sign-up
- **Payments** — Stripe card payments (Checkout) plus a mobile-money (M-Pesa/Airtel/…) simulation
- **Transactional email** — verification, password reset, order & payment notifications with PDF receipts (SMTP/Zoho)
- **Role-based dashboards** — hospital, supplier, and admin summaries
- **Admin portal** — users, suppliers, products, orders management
- **Analytics** — spending and procurement insights

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Redux Toolkit, TanStack Query |
| Backend | Node.js 20+, Express 4 |
| Database | SQLite3 (better-sqlite3) |
| Auth | JWT (access token + HttpOnly refresh cookie) |
| Payments | Stripe (Checkout) + mobile-money simulation |
| Email | Nodemailer over SMTP (Zoho) with `pdfkit` receipts |
| Deployment | Caddy (TLS + static SPA + API proxy), systemd |

## Project Structure

```
MediCare-Hub/
├── backend/            # Express API
│   ├── src/
│   │   ├── config/     # database & environment
│   │   ├── controllers/ # route handlers
│   │   ├── middleware/ # auth, validation, errors
│   │   ├── models/     # SQLite data access
│   │   ├── routes/     # API routers
│   │   ├── services/   # business logic
│   │   ├── utils/      # helpers, JWT, errors
│   │   └── seed/       # demo data
│   ├── package.json
│   └── .env.example
├── frontend/           # React SPA
├── postman/            # API collection
├── docs/               # documentation
└── README.md
```

## Installation Guide

### Prerequisites

- Node.js 20+
- Git

Run the backend and frontend in **two terminals**.

### 1. Backend (terminal 1)

```bash
cd backend
cp .env.example .env       # edit with your local settings
npm install
npm run seed               # optional, first run: create demo users & products
npm run dev                # nodemon — restarts on changes, API on :8000
```

API base URL: `http://127.0.0.1:8000/api/v1/`

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev                # Vite dev server on :3000
```

App URL: **`http://localhost:3000`**

The Vite dev server proxies `/api` and `/uploads` to the backend on `:8000`
(see `frontend/vite.config.ts`), so you don't set an API URL for local dev — just
start both and open `http://localhost:3000`. For local dev, set
`CORS_ORIGIN=http://localhost:3000` and `APP_BASE_URL=http://localhost:3000` in `backend/.env`.

### npm scripts

**Backend** (`cd backend`):

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the API with nodemon (auto-restart) on `:8000` |
| `npm start` | Start the API with plain `node` (production) |
| `npm run seed` | Wipe-free seed of demo users, suppliers & products |
| `npm test` | Run the backend test suite (`node --test`) |

**Frontend** (`cd frontend`):

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server on `:3000` (proxies API/uploads to `:8000`) |
| `npm run build` | Type-check + production build to `frontend/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src` |

> To reset local demo data: stop the backend, delete `backend/data/medicare_hub.sqlite*`, then `npm run seed`.

## Environment Variables

Create `backend/.env` locally and configure:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | API port (default 8000) |
| `DATABASE_URL` | SQLite file path (default `./data/medicare_hub.sqlite`) |
| `JWT_SECRET` | Secret for signing tokens (required in production) |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL (default `7d`) |
| `CORS_ORIGIN` | Frontend origin (`http://localhost:3000` for local dev) |
| `APP_BASE_URL` | Public app URL — used in email verification links & Stripe redirect URLs (`http://localhost:3000` locally) |
| `SEED_TEST_PASSWORD` | Password used for demo accounts |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | SMTP server (e.g. `smtp.zoho.com` / `465` / `true`). Leave host blank to disable email |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials (use an app-specific password if 2FA is on) |
| `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` | From address/name on outgoing mail |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe keys (test or live). Leave secret blank to disable card payments |
| `STRIPE_WEBHOOK_SECRET` | Optional; for the Stripe webhook endpoint |
| `STRIPE_CURRENCY` | Charge currency (default `tzs`) |
| Mobile-money / SMS keys | Optional; empty = local payment simulation |

See `backend/.env.example` for the full list. **Never commit `.env` files or the SQLite database.**

> Email and Stripe are **optional and fail-safe**: if `SMTP_HOST` or `STRIPE_SECRET_KEY` is unset, those features are simply skipped and never block requests.

## Deployment

Production runs as **two long-lived processes behind a reverse proxy**:

1. **Backend** — the Express API on `127.0.0.1:8000` (managed by systemd).
2. **Reverse proxy** — Caddy terminates TLS, serves the built frontend, proxies the API, and serves uploaded files.

The frontend is a **static build** (`frontend/dist`) served directly by the proxy — there is no Node process for the frontend in production.

### 1. Build the frontend

```bash
cd frontend
npm ci
npm run build          # outputs static assets to frontend/dist
```

The build calls the API at `VITE_API_BASE_URL` (default `/api/v1`, i.e. same origin as the site).

### 2. Run the backend as a service

```bash
cd backend
npm ci
cp .env.example .env   # fill in production secrets (JWT_SECRET, SMTP, Stripe, APP_BASE_URL, …)
npm run seed           # first deploy only — creates demo data
```

Example `systemd` unit (`/etc/systemd/system/medicare-backend.service`):

```ini
[Unit]
Description=MediCare Hub Express backend (API on :8000)
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/srv/MediCare-Hub/backend
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now medicare-backend
journalctl -u medicare-backend -f      # logs (email/payment activity is logged here)
```

> Use an absolute path to your Node binary in `ExecStart` if Node is installed via `nvm`
> (e.g. `/home/<user>/.nvm/versions/node/vXX/bin/node`), since systemd has a minimal `PATH`.

### 3. Reverse proxy (Caddy)

`/etc/caddy/Caddyfile` — automatic HTTPS, SPA fallback, API proxy, and uploads:

```caddy
your-domain.com {
    encode gzip

    # API → Express backend
    handle /api/v1/* {
        reverse_proxy 127.0.0.1:8000
    }

    # Uploaded product images (served straight from disk)
    handle /uploads/* {
        root * /srv/MediCare-Hub/backend/uploads
        uri strip_prefix /uploads
        file_server
    }

    # Everything else → the React production build (SPA)
    handle {
        root * /srv/MediCare-Hub/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

```bash
sudo systemctl reload caddy
```

Set `APP_BASE_URL=https://your-domain.com` and `CORS_ORIGIN=https://your-domain.com` in `backend/.env`.

### Redeploying

- **Backend code change:** `git pull` → `npm ci` (if deps changed) → `sudo systemctl restart medicare-backend`
- **Frontend change:** `npm run build` in `frontend/` — Caddy serves the new `dist` immediately (no restart needed)
- **Reset demo data:** stop the backend, delete `backend/data/medicare_hub.sqlite*`, run `npm run seed`, start the backend

### Production notes

- **Email links / deliverability:** set up SPF, DKIM, and DMARC DNS records for your sending domain, or mailbox providers (e.g. Gmail) may mark messages as spam and disable links.
- **Stripe:** test mode uses `sk_test_…` keys; switch to live keys for production. Card charges must be ≥ ~$0.50 equivalent. For guaranteed reliability, configure a Stripe **webhook** and set `STRIPE_WEBHOOK_SECRET`.
- **DB durability:** SQLite lives in `backend/data/`. Back it up; migrate to PostgreSQL for higher concurrency.

## Local Test Data

Run `npm run seed` in the `backend` directory to create demo accounts. Credentials are printed to your terminal only and are not stored in this repository.

| Role | Email | Password |
|------|-------|----------|
| Hospital | `hospital.test@medicarehub.test` | `SEED_TEST_PASSWORD` |
| Supplier | `supplier.test@medicarehub.test` | `SEED_TEST_PASSWORD` |
| Admin | `admin.test@medicarehub.test` | `SEED_TEST_PASSWORD` |

## Running Tests

### Backend

```bash
cd backend
npm test
```

### Frontend

```bash
cd frontend
npm run build
```

## User Roles

| Role | Capabilities |
|------|--------------|
| **Hospital** | Browse marketplace, cart, checkout, view orders, confirm delivery |
| **Supplier** | Manage products & batches, process incoming orders |
| **Admin** | Manage users, verify suppliers, oversee products and orders |

## API Overview

| Prefix | Description |
|--------|-------------|
| `/api/v1/auth/` | Register, login, refresh, password reset |
| `/api/v1/marketplace/` | Products, categories, batches |
| `/api/v1/orders/` | Cart, checkout, order workflow |
| `/api/v1/payments/` | Stripe checkout/confirm, mobile-money simulation, webhooks |
| `/api/v1/dashboard/` | Role-based dashboard summaries |
| `/api/v1/admin/` | Admin management APIs |
| `/api/v1/analytics/` | Procurement analytics (stubs) |
| `/api/v1/notifications/` | Notifications (stubs) |

Import `postman/MediCare-Hub-API.postman_collection.json` for a full endpoint reference (collection still reflects the previous Django API; update paths are identical).

## Migration Notes

The backend has been migrated from Django to **Node.js/Express + SQLite**. The React frontend and API contract were preserved as much as possible so existing clients continue to work.

## Future Enhancements

- Production PostgreSQL deployment
- Real payment gateway go-live (M-Pesa, Selcom, Airtel)
- Redis-backed carts in production
- Email/SMS notification providers
- Hospital reporting exports
- CI/CD pipeline and Docker Compose production stack

## License

This project is provided as an MVP for educational and collaboration purposes. Add an explicit open-source license (e.g. MIT) before public distribution if required.

## Security

See [SECURITY.md](SECURITY.md). Do not commit `.env`, database files, or API keys. Rotate `JWT_SECRET` and JWT settings for production.
