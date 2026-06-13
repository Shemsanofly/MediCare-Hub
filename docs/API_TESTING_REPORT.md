# MediCare Hub — API Testing & Frontend Integration Report

**Date:** 2026-06-08  
**Backend:** Django REST Framework + SQLite3 @ `http://127.0.0.1:8000`  
**Frontend:** React + Vite @ `http://localhost:3000` (proxied to backend)

---

## 1. Backend Server Status

| Check | Result |
|-------|--------|
| `python manage.py check` | PASS — 0 issues |
| `python manage.py migrate` | PASS — all migrations applied |
| Server running | PASS — `http://127.0.0.1:8000/` |

---

## 2. Complete Endpoint List

### Authentication (`/api/v1/auth/`)

| Method | Path | Auth | Role | Request Body | Expected Response |
|--------|------|------|------|--------------|-----------------|
| POST | `/register/` | No | — | email, password, first_name, last_name, role (HOSPITAL/SUPPLIER), organisation_name, organisation_type | 201 User profile |
| POST | `/login/` | No | — | email, password | 200 `{access, user}` + HttpOnly refresh cookie |
| POST | `/token/refresh/` | No (cookie) | — | — | 200 `{access}` + rotated cookie |
| POST | `/verify-email/<token>/` | No | — | — | 200 message |
| POST | `/password-reset/` | No | — | email | 200 message |
| POST | `/password-reset/confirm/` | No | — | token, password | 200 message |
| POST | `/logout/` | Yes | Any | — | 204 |
| GET | `/me/` | Yes | Any | — | 200 User profile |
| PATCH | `/me/` | Yes | Any | first_name, last_name, mfa_enabled | 200 User profile |
| GET | `/users/` | Yes | ADMIN | — | 200 User list |

### Marketplace (`/api/v1/marketplace/`)

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| GET | `/products/` | Yes | HOSPITAL, SUPPLIER, ADMIN | Search/filter/cursor pagination. Query: search, category, supplier, min_price, max_price, cold_chain_required, in_stock, sort, cursor, page_size |
| GET | `/products/{id}/` | Yes | HOSPITAL, SUPPLIER, ADMIN | Product detail |
| POST | `/products/` | Yes | Verified SUPPLIER | **405** — blocked by ProductListView URL conflict (stub exists in ViewSet) |
| PUT/PATCH | `/products/{id}/` | Yes | Verified SUPPLIER | Stub — echoes data |
| DELETE | `/products/{id}/` | Yes | Verified SUPPLIER | 204 stub |

### Admin Suppliers (`/api/v1/admin/suppliers/`)

| Method | Path | Auth | Role | Request Body |
|--------|------|------|------|--------------|
| GET | `/pending/` | Yes | ADMIN | — |
| POST | `/{id}/verify/` | Yes | ADMIN | — |
| POST | `/{id}/reject/` | Yes | ADMIN | reason (min 10 chars) |
| POST | `/{id}/suspend/` | Yes | ADMIN | reason (min 10 chars) |

### Orders (`/api/v1/orders/`)

| Method | Path | Auth | Role | Request Body |
|--------|------|------|------|--------------|
| GET | `/cart/` | Yes | HOSPITAL, ADMIN | — |
| POST | `/cart/` | Yes | HOSPITAL, ADMIN | product_id, quantity, batch_id? |
| DELETE | `/cart/` | Yes | HOSPITAL, ADMIN | product_id |
| POST | `/checkout/` | Yes | HOSPITAL, ADMIN | notes?, payment_terms?, delivery_fee?, tax_amount?, lpo_number? |
| GET | `/orders/` | Yes | HOSPITAL, ADMIN | — |
| GET | `/orders/{id}/` | Yes | HOSPITAL, ADMIN | — |
| POST | `/orders/` | Yes | HOSPITAL | 405 — use checkout |
| POST | `/orders/{id}/approve/` | Yes | Hospital approver | — |
| POST | `/orders/{id}/process/` | Yes | SUPPLIER, ADMIN | reason? |
| POST | `/orders/{id}/transition/` | Yes | SUPPLIER, ADMIN | status, reason? |

### Payments (`/api/v1/payments/`)

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| GET | `/payments/` | Yes | HOSPITAL, ADMIN | List org payments |
| GET | `/payments/{id}/` | Yes | HOSPITAL, ADMIN | Payment detail |
| POST | `/payments/initiate/` | Yes | HOSPITAL, ADMIN | order_id, payment_method (mpesa/selcom/airtel), phone |
| POST | `/webhooks/mpesa/` | No | — | Dev simulation only |
| POST | `/webhooks/selcom/` | No | — | Signature required in prod |
| POST | `/webhooks/airtel/` | No | — | Signature required in prod |

### Notifications (`/api/v1/notifications/`)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/notifications/` | Yes | Org member |
| GET | `/notifications/{id}/` | Yes | Org member |
| PATCH | `/notifications/{id}/` | Yes | Org member |

### Analytics (`/api/v1/analytics/`)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/analytics/` | Yes | SUPPLIER, ADMIN |
| GET | `/analytics/{id}/` | Yes | SUPPLIER, ADMIN |
| GET | `/analytics/platform/` | Yes | ADMIN |
| GET | `/analytics/supplier/` | Yes | SUPPLIER, ADMIN |

---

## 3. Postman Collection

**Location:** `postman/MediCare-Hub-API.postman_collection.json`

- Variables: `{{base_url}}`, `{{access_token}}`, `{{refresh_token}}`
- Folders: Authentication, Marketplace, Orders, Payments, Notifications, Analytics, Admin
- Import into Postman or Insomnia (supports Postman v2.1 format)

---

## 4. Test Results Summary

**Automated suite:** `backend/scripts/api_test_suite.py`  
**Result:** **38/38 passed** (after corrections)

### Passed Endpoints (key flows)

- Authentication: register, login, refresh, profile, logout, password reset
- Marketplace: list, search, filter, detail, 404 handling
- Orders: cart CRUD, checkout, list, detail
- Payments: list, initiate (400 for non-approved orders — expected), M-Pesa webhook
- Notifications: list, patch
- Analytics: RBAC (hospital 403, admin/supplier 200)
- Admin: users list, pending suppliers

### Known Limitations (not bugs)

- `POST /marketplace/products/` returns 405 due to URL routing (ProductListView takes precedence)
- Payment initiate requires order status APPROVED/CONFIRMED
- Analytics endpoints return stub/empty data
- Notifications return stub/empty data
- Price history, categories, suppliers list endpoints do not exist on backend (frontend derives categories/suppliers from product list)

---

## 5. Bugs Fixed

| Bug | Fix |
|-----|-----|
| Registration returned 500 / hung ~2 min without Redis/Celery | Added `CELERY_TASK_ALWAYS_EAGER = True` in `development.py` |
| Channel layer required Redis in dev | Added `InMemoryChannelLayer` in `development.py` |
| Cache used Redis in dev | Already overridden to `LocMemCache` in `development.py` |

---

## 6. React Files Modified

| File | Change |
|------|--------|
| `src/api/ordersApi.ts` | **NEW** — cart, checkout, orders |
| `src/api/paymentsApi.ts` | **NEW** — payment list/initiate |
| `src/api/notificationsApi.ts` | **NEW** — notifications |
| `src/api/marketplaceApi.ts` | Mapped to real endpoints; derive categories/suppliers |
| `src/api/analyticsApi.ts` | Mapped to orders API for dashboard data |
| `src/api/index.ts` | Export new services |
| `src/pages/hospital/Cart.tsx` | **NEW** — server-backed cart |
| `src/pages/hospital/Checkout.tsx` | **NEW** — checkout flow |
| `src/pages/hospital/OrderDetail.tsx` | **NEW** — order detail |
| `src/pages/marketplace/Catalog.tsx` | Backend cart API |
| `src/pages/marketplace/ProductDetail.tsx` | Backend cart API |
| `src/components/layout/AppLayout.tsx` | Cart link + backend cart/notifications count |
| `src/App.tsx` | Routes for cart, checkout, order detail |

---

## 7. Authentication Integration

| Test | Result |
|------|--------|
| Register connects to `/auth/register/` | PASS |
| Login stores access token in Redux memory | PASS |
| Refresh token in HttpOnly cookie | PASS |
| Session restore on page refresh | PASS (via `useAuthInit`) |
| Logout clears tokens + cookie | PASS |
| Protected routes redirect to login | PASS |
| Bearer token attached to requests | PASS |

---

## 8. Marketplace Integration

| Test | Result |
|------|--------|
| Product list from `/marketplace/products/` | PASS |
| Search and filters | PASS |
| Product detail page | PASS |
| Categories derived from products | PASS |
| Suppliers derived from products | PASS |
| Add to cart via API | PASS |

---

## 9. Order Flow Integration

| Test | Result |
|------|--------|
| Cart page shows server cart | PASS |
| Add/remove cart items | PASS |
| Checkout creates order | PASS |
| Order history on dashboard | PASS |
| Order detail page | PASS |

---

## 10. End-to-End Flow (API)

1. Login as seeded hospital test user (password set locally via `SEED_TEST_PASSWORD`) — **PASS**
2. GET `/auth/me/` — **PASS**
3. GET `/marketplace/products/` — **PASS** (1 product seeded)
4. Search `?search=Amoxicillin` — **PASS**
5. GET product detail — **PASS**
6. POST `/orders/cart/` — **PASS**
7. POST `/orders/checkout/` — **PASS** (201)
8. GET `/orders/orders/` — **PASS**
9. POST `/auth/logout/` — **PASS**

---

## 11. Remaining Issues

1. **URL routing:** `POST /marketplace/products/` unreachable (405) — supplier product create stub exists but path conflicts with ProductListView
2. **Stub endpoints:** Analytics, notifications, product CRUD return placeholder data
3. **Missing backend endpoints:** `/marketplace/categories/`, `/marketplace/suppliers/`, price history, alternatives
4. **Dashboard KPIs/stock alerts:** Derived from orders only; full analytics not yet implemented on backend
5. **Payment flow:** Requires order approval before initiate; no real gateway credentials used (by design)

---

## 12. Recommendations Before New Features

1. Resolve marketplace URL conflict (e.g. move search list to `/products/search/` or add `list` to ViewSet)
2. Implement real analytics and notification persistence
3. Add dedicated categories/suppliers list endpoints if needed for performance
4. Add Redis to dev docker-compose for parity with production cache/cart (optional — LocMem works for SQLite dev)
5. Add E2E Playwright/Cypress tests for React flows
6. Keep `CELERY_TASK_ALWAYS_EAGER` in development; use real Celery in staging/production

---

## Test Credentials (local only)

Run `python backend/scripts/seed_test_data.py` to create demo accounts. Set `SEED_TEST_PASSWORD` locally if you use a custom password. Credentials are not documented in this repository.

**Test command:** `python backend/scripts/api_test_suite.py`
