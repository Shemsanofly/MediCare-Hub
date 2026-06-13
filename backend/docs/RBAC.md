# Role-Based Access Control (RBAC)

MediCare Hub uses explicit Django REST Framework permission classes on every API endpoint. Default DRF permissions are never relied upon at the view level.

## Role Matrix

| Capability | Hospital | Supplier | Admin |
| --- | --- | --- | --- |
| Browse product catalog | Yes | Yes | Yes |
| Place procurement orders | Yes | No | Yes |
| View own organisation orders | Yes | Yes | Yes (all) |
| Approve procurement orders | Yes (verified, within limit) | No | Yes |
| Manage own products | No | Yes (verified org) | Yes |
| View and process supplier orders | No | Yes | Yes |
| View own supplier analytics | No | Yes | Yes |
| View platform analytics | No | No | Yes |
| Verify suppliers | No | No | Yes |
| Ban / deactivate users | No | No | Yes |
| Manage own profile | Yes | Yes | Yes |

## Permission Classes

Defined in `authentication/permissions.py`:

| Class | Purpose |
| --- | --- |
| `IsHospitalUser` | User role is `HOSPITAL` |
| `IsSupplierUser` | User role is `SUPPLIER` |
| `IsAdminUser` | User role is `ADMIN` |
| `IsVerifiedSupplier` | Supplier user with verified account and verified organisation |
| `IsOrganisationMember` | User belongs to the organisation referenced in the request |
| `HasProcurementApprovalPermission` | User can approve the order amount in the request |
| `IsHospitalOrAdmin` | Hospital or admin users |
| `IsSupplierOrAdmin` | Supplier or admin users |
| `IsHospitalOrSupplierOrAdmin` | Any authenticated platform role |

## Endpoint Permission Mapping

### Authentication (`/api/v1/auth/`)

| Endpoint | Permissions |
| --- | --- |
| `POST /register/` | `AllowAny` |
| `POST /token/` | `AllowAny` |
| `POST /token/refresh/` | `AllowAny` |
| `POST /logout/` | `IsAuthenticated` |
| `GET/PATCH /me/` | `IsAuthenticated` |
| `GET /users/` | `IsAuthenticated`, `IsAdminUser` |

### Marketplace (`/api/v1/marketplace/`)

| ViewSet / Action | Permissions |
| --- | --- |
| `ProductViewSet.list`, `retrieve` | `IsAuthenticated`, `IsHospitalOrSupplierOrAdmin` |
| `ProductViewSet.create`, `update`, `destroy` | `IsAuthenticated`, `IsVerifiedSupplier` |

### Orders (`/api/v1/orders/`)

| ViewSet / Action | Permissions |
| --- | --- |
| `OrderViewSet.list`, `retrieve`, `create` | `IsAuthenticated`, `IsHospitalOrAdmin`, `IsOrganisationMember` |
| `OrderViewSet.approve` | `IsAuthenticated`, `HasProcurementApprovalPermission`, `IsOrganisationMember` |
| `OrderViewSet.update`, `process` | `IsAuthenticated`, `IsSupplierOrAdmin`, `IsOrganisationMember` |
| `OrderViewSet.destroy` | `IsAuthenticated`, `IsAdminUser` |

### Payments (`/api/v1/payments/`)

| ViewSet / Action | Permissions |
| --- | --- |
| `PaymentViewSet.list`, `retrieve`, `create` | `IsAuthenticated`, `IsHospitalOrAdmin`, `IsOrganisationMember` |
| Other actions | `IsAuthenticated`, `IsAdminUser` |

### Notifications (`/api/v1/notifications/`)

| ViewSet / Action | Permissions |
| --- | --- |
| `NotificationViewSet.list`, `retrieve`, `partial_update` | `IsAuthenticated`, `IsOrganisationMember` |
| Other actions | `IsAuthenticated`, `IsAdminUser` |

### Analytics (`/api/v1/analytics/`)

| ViewSet / Action | Permissions |
| --- | --- |
| `AnalyticsViewSet.platform` | `IsAuthenticated`, `IsAdminUser` |
| `AnalyticsViewSet.list`, `retrieve`, `supplier` | `IsAuthenticated`, `IsSupplierOrAdmin` |

## JWT Configuration

- Access token lifetime: **15 minutes**
- Refresh token lifetime: **7 days**
- Refresh token rotation: **enabled**
- Blacklist after rotation: **enabled**

## Registration Flow

1. User submits registration with organisation details.
2. `CustomUser` is created; `_pending_organisation_data` is attached.
3. `post_save` signal creates the linked `Organisation` record.
4. Welcome email task is queued (Celery).

## Procurement Approval Rules

Hospital users may approve orders when:

- User account is verified
- Organisation is verified
- Order amount is within the default approval limit (TZS 5,000,000)

Administrators may approve any amount.
