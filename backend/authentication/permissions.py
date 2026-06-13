"""Role-based access control permissions for MediCare Hub."""

from decimal import Decimal, InvalidOperation

from rest_framework.permissions import BasePermission, SAFE_METHODS
from rest_framework.request import Request
from rest_framework.views import APIView

from authentication.models import CustomUser


def _get_client_ip(request: Request) -> str | None:
    """Extract the client IP address from request headers."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _get_request_organisation_id(request: Request, view: APIView) -> str | None:
    """Resolve organisation ID from URL kwargs, query params, or body."""
    org_id = view.kwargs.get('organisation_id') or view.kwargs.get('organisation_pk')
    if org_id:
        return str(org_id)
    org_id = request.query_params.get('organisation_id')
    if org_id:
        return str(org_id)
    if isinstance(request.data, dict):
        org_id = request.data.get('organisation_id')
        if org_id:
            return str(org_id)
    return None


def _get_request_order_amount(request: Request, view: APIView) -> Decimal | None:
    """Resolve order amount from URL kwargs or request body."""
    raw_amount = view.kwargs.get('order_amount') or view.kwargs.get('amount')
    if raw_amount is None and isinstance(request.data, dict):
        raw_amount = request.data.get('amount') or request.data.get('total_amount')
    if raw_amount is None:
        return None
    try:
        return Decimal(str(raw_amount))
    except (InvalidOperation, TypeError, ValueError):
        return None


class IsHospitalUser(BasePermission):
    """Allow access only to users with the HOSPITAL role."""

    message = 'This action requires a hospital user account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role == CustomUser.Role.HOSPITAL
        )


class IsSupplierUser(BasePermission):
    """Allow access only to users with the SUPPLIER role."""

    message = 'This action requires a supplier user account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role == CustomUser.Role.SUPPLIER
        )


class IsAdminUser(BasePermission):
    """Allow access only to users with the ADMIN role."""

    message = 'This action requires an administrator account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role == CustomUser.Role.ADMIN
        )


class IsVerifiedSupplier(BasePermission):
    """Allow access only to verified suppliers with verified organisations."""

    message = 'This action requires a verified supplier organisation.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not isinstance(user, CustomUser) or not user.is_authenticated:
            return False
        if user.role != CustomUser.Role.SUPPLIER:
            return False
        if not user.is_verified:
            return False
        if user.organisation is None or not user.organisation.is_verified:
            return False
        return True


class IsOrganisationMember(BasePermission):
    """Allow access only when the user belongs to the organisation in the request."""

    message = 'You do not belong to the requested organisation.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not isinstance(user, CustomUser) or not user.is_authenticated:
            return False
        if user.role == CustomUser.Role.ADMIN:
            return True
        org_id = _get_request_organisation_id(request, view)
        if org_id is None:
            return user.organisation_id is not None
        return user.organisation_id is not None and str(user.organisation_id) == org_id


class HasProcurementApprovalPermission(BasePermission):
    """Allow access when the user can approve procurement for the order amount."""

    message = 'You do not have approval rights for this order amount.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not isinstance(user, CustomUser) or not user.is_authenticated:
            return False
        amount = _get_request_order_amount(request, view)
        if amount is None:
            return user.role in (CustomUser.Role.HOSPITAL, CustomUser.Role.ADMIN)
        return user.can_approve_procurement(amount)


class IsHospitalOrAdmin(BasePermission):
    """Allow hospital users or platform administrators."""

    message = 'This action requires a hospital or administrator account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role in (CustomUser.Role.HOSPITAL, CustomUser.Role.ADMIN)
        )


class IsSupplierOrAdmin(BasePermission):
    """Allow supplier users or platform administrators."""

    message = 'This action requires a supplier or administrator account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role in (CustomUser.Role.SUPPLIER, CustomUser.Role.ADMIN)
        )


class IsAuthenticatedReadOnly(BasePermission):
    """Allow authenticated users read-only access."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        return (
            isinstance(request.user, CustomUser)
            and request.user.is_authenticated
            and request.method in SAFE_METHODS
        )


class IsAnyOf(BasePermission):
    """Allow access when any of the given permission classes grant access."""

    def __init__(self, *permission_classes: type[BasePermission]):
        self.permission_classes = permission_classes

    def has_permission(self, request: Request, view: APIView) -> bool:
        return any(
            permission().has_permission(request, view)
            for permission in self.permission_classes
        )


class IsHospitalOrSupplierOrAdmin(BasePermission):
    """Allow hospital, supplier, or administrator users."""

    message = 'This action requires a hospital, supplier, or administrator account.'

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return (
            isinstance(user, CustomUser)
            and user.is_authenticated
            and user.role in (
                CustomUser.Role.HOSPITAL,
                CustomUser.Role.SUPPLIER,
                CustomUser.Role.ADMIN,
            )
        )
