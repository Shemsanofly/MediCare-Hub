# MediCare Hub

MediCare Hub is a healthcare procurement platform that connects hospitals with verified pharmaceutical suppliers in Tanzania. Hospitals browse marketplace catalogues, manage carts, place orders, and track fulfillment. Suppliers manage products, inventory batches, and order workflows. Administrators oversee users, supplier verification, products, and platform orders.

## Features

- **JWT authentication** with role-based access (Hospital, Supplier, Admin)
- **Marketplace** — product catalog, search, filters, product detail with stock summary
- **Product CRUD** — suppliers create and manage product listings
- **Inventory & batches** — FIFO stock allocation, reservations, expiry tracking, low-stock alerts
- **Cart & checkout** — hospital procurement with approval thresholds
- **Order lifecycle** — accept, reject, prepare, ship, deliver, complete
- **Role-based dashboards** — hospital, supplier, and admin summaries
- **Admin portal** — users, suppliers, products, orders management
- **Payments & notifications** — gateway integration scaffolding (M-Pesa, Selcom, Airtel)
- **Analytics** — spending and procurement insights

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Redux Toolkit, TanStack Query |
| Backend | Django 5, Django REST Framework |
| Database | SQLite3 (development), PostgreSQL-ready |
| Auth | JWT (access token + HttpOnly refresh cookie) |
| Cache / tasks | Redis, Celery (eager mode in dev) |

## Project Structure

```
med_hub/
├── backend/          # Django API
│   ├── authentication/
│   ├── marketplace/
│   ├── orders/
│   ├── payments/
│   ├── dashboard/
│   ├── admin_portal/
│   └── medicare_hub/ # settings & URLs
├── frontend/         # React SPA
├── postman/          # API collection
├── docs/             # documentation (incl. ENVIRONMENT_VARIABLES.md)
└── README.md
```

## Installation Guide

### Prerequisites

- Python 3.11+
- Node.js 18+
- Git

### Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
# Create backend/.env locally — see docs/ENVIRONMENT_VARIABLES.md

python manage.py migrate
python scripts/seed_test_data.py   # optional: seed demo users & products
python manage.py runserver
```

API base URL: `http://127.0.0.1:8000/api/v1/`

### Frontend Setup

```bash
cd frontend
npm install
# optional: create frontend/.env — see docs/ENVIRONMENT_VARIABLES.md
npm run dev
```

App URL: `http://localhost:5173`

## Environment Variables

Create `backend/.env` locally and configure:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key (required) |
| `DEBUG` | `True` for development |
| `DJANGO_SETTINGS_MODULE` | `medicare_hub.settings.development` |
| `CORS_ALLOWED_ORIGINS` | Frontend origin(s) |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Access token TTL |
| Payment / email keys | Optional; leave empty for local dev |

See `docs/ENVIRONMENT_VARIABLES.md` for the full variable list. **Never commit `.env` files.**

### Local test data

Run `python scripts/seed_test_data.py` locally to create demo accounts. Credentials are printed to your terminal only and are not stored in this repository.

## Running Tests

### Backend

```bash
cd backend
python manage.py test
python scripts/api_test_suite.py   # requires running server
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
| `/api/v1/marketplace/` | Products, batches, catalog search |
| `/api/v1/orders/` | Cart, checkout, order workflow |
| `/api/v1/payments/` | Payment initiation & webhooks |
| `/api/v1/dashboard/` | Role-based dashboard summaries |
| `/api/v1/admin/` | Admin management APIs |
| `/api/v1/analytics/` | Procurement analytics |
| `/api/v1/notifications/` | Notification preferences |

Import `postman/MediCare-Hub-API.postman_collection.json` for a full endpoint reference.

## Future Enhancements

- Production PostgreSQL deployment
- Real payment gateway go-live (M-Pesa, Selcom)
- Hospital reporting exports
- Multi-batch order line display
- Email/SMS notification production providers
- CI/CD pipeline and Docker Compose production stack

## License

This project is provided as an MVP for educational and collaboration purposes. Add an explicit open-source license (e.g. MIT) before public distribution if required.

## Security

See [SECURITY.md](SECURITY.md). Do not commit `.env`, database files, or API keys. Rotate `SECRET_KEY` and JWT settings for production.
