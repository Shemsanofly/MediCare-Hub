# Security Policy

## Never commit

- `.env` or any file containing real API keys, passwords, or tokens
- SQLite database files (`db.sqlite3`, `*.sqlite3`)
- `node_modules/`, `frontend/dist/`
- Private keys (`.pem`, `.key`, `.p12`)
- `credentials.json`, `secrets.json`

## Local setup

1. Create `backend/.env` locally from `docs/ENVIRONMENT_VARIABLES.md`
2. Generate a new `SECRET_KEY` for each environment
3. Use placeholder/test credentials only on your local machine

## Reporting

If you discover exposed credentials in this repository, rotate the affected secrets immediately and open a private security issue with the maintainer.
