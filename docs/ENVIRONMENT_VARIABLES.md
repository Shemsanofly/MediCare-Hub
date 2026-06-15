# Environment Variables

Copy this checklist locally and create `backend/.env` on your machine. **Do not commit `.env` files to Git.**

## Required (development)

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` (default) or `production` |
| `PORT` | API port, default `8000` |
| `DATABASE_URL` | SQLite file path, default `./data/medicare_hub.sqlite` |
| `JWT_SECRET` | Generate a unique random string locally; used to sign JWTs |

## Optional (local dev)

| Variable | Description |
|----------|-------------|
| `CORS_ORIGIN` | Frontend URL, default `http://localhost:5173` |
| `REDIS_URL` | Redis connection (optional; carts fall back to SQLite) |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime, default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime, default `7d` |

## Production only

Configure payment, email, SMS, and database variables in your deployment platform secrets manager — never in source control.

| Category | Examples |
|----------|----------|
| Database | `DATABASE_URL` (PostgreSQL connection string when migrating from SQLite) |
| Email | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` |
| SMS | `SMS_API_KEY` |
| Payments | `MPESA_API_KEY`, `MPESA_API_SECRET`, `SELCOM_API_KEY`, `SELCOM_API_SECRET`, `AIRTEL_API_KEY`, `AIRTEL_API_SECRET` |

## Local seed script (optional)

| Variable | Description |
|----------|-------------|
| `SEED_TEST_PASSWORD` | Password for demo users created by `npm run seed` |

## Frontend

Create `frontend/.env` only if needed:

```
VITE_API_BASE_URL=/api/v1
```
