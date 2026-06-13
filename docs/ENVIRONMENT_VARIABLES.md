# Environment Variables

Copy this checklist locally and create `backend/.env` on your machine. **Do not commit `.env` files to Git.**

## Required (development)

| Variable | Description |
|----------|-------------|
| `DJANGO_SETTINGS_MODULE` | e.g. `medicare_hub.settings.development` |
| `SECRET_KEY` | Generate a unique random string locally |
| `DEBUG` | `True` for local development |
| `ALLOWED_HOSTS` | Comma-separated hosts |

## Optional (local dev)

| Variable | Description |
|----------|-------------|
| `CORS_ALLOWED_ORIGINS` | Frontend URL(s) |
| `REDIS_URL` | Redis connection (optional in dev) |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Access token lifetime |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | Refresh token lifetime |

## Production only

Configure payment, email, SMS, and AWS variables in your deployment platform secrets manager — never in source control.

| Category | Examples |
|----------|----------|
| Database | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` |
| Email | `SENDGRID_API_KEY`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` |
| Payments | `MPESA_*`, `SELCOM_*`, `AIRTEL_*` |
| Storage | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET_NAME` |

## Local seed script (optional)

| Variable | Description |
|----------|-------------|
| `SEED_TEST_PASSWORD` | Password for demo users created by `scripts/seed_test_data.py` |

## Frontend

Create `frontend/.env` only if needed:

```
VITE_API_BASE_URL=/api/v1
```
