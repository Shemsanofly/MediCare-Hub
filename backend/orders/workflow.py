"""Supplier order processing workflow helpers."""

from __future__ import annotations

from authentication.models import CustomUser
from authentication.services import create_audit_log
from orders.errors import OrderTransitionError
from orders.models import Order
from orders.services import CheckoutService
from orders.state_machine import OrderStateManager
from rest_framework.request import Request


def get_order_for_user(user: CustomUser, order_id: str) -> Order | None:
    """Return an order visible to the given user, or None."""
    queryset = Order.objects.select_related(
        'buyer',
        'organisation',
        'supplier',
        'supplier__organisation',
    ).prefetch_related(
        'items__product',
        'items__batch',
        'approval_steps',
        'status_history__changed_by',
    )

    if user.role == CustomUser.Role.ADMIN:
        return queryset.filter(pk=order_id).first()

    if user.role == CustomUser.Role.HOSPITAL:
        return queryset.filter(
            pk=order_id,
            organisation_id=user.organisation_id,
        ).first()

    if user.role == CustomUser.Role.SUPPLIER:
        return queryset.filter(
            pk=order_id,
            supplier__organisation_id=user.organisation_id,
        ).first()

    return None


def transition_order(
    *,
    request: Request,
    order: Order,
    new_status: str,
    reason: str = '',
    audit_action: str,
) -> dict:
    """Apply a workflow transition, audit log, and return serialized order."""
    previous_status = order.status
    try:
        order = OrderStateManager.transition(
            order,
            new_status,
            request.user,
            reason=reason,
        )
    except OrderTransitionError:
        raise

    create_audit_log(
        action=audit_action,
        request=request,
        user=request.user,
        metadata={
            'order_id': str(order.id),
            'from_status': previous_status,
            'to_status': order.status,
            'reason': reason,
        },
    )

    return CheckoutService._serialize_order(order)
