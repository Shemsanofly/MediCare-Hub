---
name: stack-switched-to-express-sqlite
description: Backend was migrated from Django to Node.js/Express + SQLite; React frontend preserved.
metadata:
  type: project
---

As of 2026-06-13 the MediCare Hub backend was migrated from Django 5 to Node.js 20+/Express 4 + SQLite3 (better-sqlite3). The React frontend and API contract were kept compatible.

**Why:** User requested the stack switch while keeping SQLite and React.

**How to apply:**
- Backend code lives in `backend/` (Express). The old Django backend is archived at `backend-django/` for reference.
- Run `cd backend && npm install && cp .env.example .env && npm run seed && npm run dev`.
- API base URL remains `http://127.0.0.1:8000/api/v1/`.
- Demo accounts are created by `npm run seed`.
- Frontend setup unchanged: `cd frontend && npm install && npm run dev`.

**Key implementation details:**
- JWT auth with HttpOnly refresh cookie (path `/api/v1/auth/`).
- SQLite schema covers users, organisations, suppliers, products, batches, orders, payments, escrow, dashboards.
- Cart uses SQLite (with Redis optional via `REDIS_URL`).
- Payment gateways are stubbed when keys are empty; payments auto-complete in dev.
- Order lifecycle supports accept → pay → prepare → ship → deliver → complete.
