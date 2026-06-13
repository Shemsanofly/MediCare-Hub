"""Order lifecycle state machine."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db import transaction

from authentication.models import CustomUser
from orders.errors import OrderTransitionError
from orders.models import Order, OrderStatusHistory

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

VALID_TRANSITIONS: dict[str, set[str]] = {
    Order.Status.PENDING: {
        Order.Status.ACCEPTED,
        Order.Status.REJECTED,
        Order.Status.APPROVED,
        Order.Status.CANCELLED,
        Order.Status.DISPUTED,
    },
    Order.Status.ACCEPTED: {
        Order.Status.PREPARING,
        Order.Status.CANCELLED,
        Order.Status.DISPUTED,
    },
    Order.Status.REJECTED: set(),
    Order.Status.PREPARING: {
        Order.Status.SHIPPED,
        Order.Status.DISPUTED,
    },
    Order.Status.APPROVED: {
        Order.Status.CONFIRMED,
        Order.Status.CANCELLED,
        Order.Status.DISPUTED,
    },
    Order.Status.CONFIRMED: {
        Order.Status.PAID,
        Order.Status.CANCELLED,
        Order.Status.DISPUTED,
    },
    Order.Status.PAID: {
        Order.Status.PROCESSING,
        Order.Status.DISPUTED,
    },
    Order.Status.PROCESSING: {
        Order.Status.SHIPPED,
        Order.Status.DISPUTED,
    },
    Order.Status.SHIPPED: {
        Order.Status.DELIVERED,
        Order.Status.DISPUTED,
    },
    Order.Status.DELIVERED: {
        Order.Status.COMPLETED,
        Order.Status.DISPUTED,
    },
    Order.Status.COMPLETED: set(),
    Order.Status.CANCELLED: {
        Order.Status.DISPUTED,
    },
    Order.Status.DISPUTED: set(),
}

DISPUTE_FROM_ANY = True


class OrderStateManager:
    """Controls valid order status transitions with permission checks."""

    @classmethod
    def transition(
        cls,
        order: Order,
        new_status: str,
        user: CustomUser,
        reason: str | None = None,
    ) -> Order:
        """
        Transition an order to a new status.

        Validates the transition, checks permissions, records history, and
        dispatches notification tasks within a database transaction.
        """
        new_status = str(new_status)
        current_status = order.status

        cls._validate_transition(order, current_status, new_status)
        cls._check_permission(order, current_status, new_status, user)

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status != current_status:
                raise OrderTransitionError(
                    f'Order status changed concurrently from {current_status} '
                    f'to {order.status}. Please retry.',
                    code='CONCURRENT_STATUS_CHANGE',
                    status_code=409,
                )

            old_status = order.status
            order.status = new_status
            order.save(update_fields=['status', 'updated_at'])

            OrderStatusHistory.objects.create(
                order=order,
                from_status=old_status,
                to_status=new_status,
                changed_by=user,
                reason=reason or '',
            )

            cls._handle_inventory_transition(order, new_status)

            cls._dispatch_notifications(order, old_status, new_status, user)

            logger.info(
                'Order status transitioned',
                extra={
                    'order': order.to_dict(),
                    'from_status': old_status,
                    'to_status': new_status,
                    'user_id': str(user.id),
                },
            )

        order.refresh_from_db()
        return order

    @classmethod
    def automated_transition(
        cls,
        order: Order,
        new_status: str,
        reason: str | None = None,
    ) -> Order:
        """
        Transition order status from automated systems (e.g. payment webhooks).

        Skips permission checks but validates transition rules.
        Uses the order buyer as changed_by when available.
        """
        new_status = str(new_status)
        current_status = order.status
        cls._validate_transition(order, current_status, new_status)

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status != current_status:
                raise OrderTransitionError(
                    f'Order status changed concurrently from {current_status} '
                    f'to {order.status}. Please retry.',
                    code='CONCURRENT_STATUS_CHANGE',
                    status_code=409,
                )

            old_status = order.status
            order.status = new_status
            order.save(update_fields=['status', 'updated_at'])

            OrderStatusHistory.objects.create(
                order=order,
                from_status=old_status,
                to_status=new_status,
                changed_by=order.buyer,
                reason=reason or 'Automated system transition',
            )

            cls._dispatch_notifications(order, old_status, new_status, order.buyer)

            logger.info(
                'Order automated status transition',
                extra={
                    'order': order.to_dict(),
                    'from_status': old_status,
                    'to_status': new_status,
                },
            )

        order.refresh_from_db()
        return order

    @classmethod
    def _validate_transition(
        cls,
        order: Order,
        current_status: str,
        new_status: str,
    ) -> None:
        if new_status == Order.Status.DISPUTED and DISPUTE_FROM_ANY:
            if current_status == Order.Status.DISPUTED:
                raise OrderTransitionError(
                    'Order is already in DISPUTED status.',
                    code='ALREADY_DISPUTED',
                    status_code=400,
                )
            return

        allowed = VALID_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            raise OrderTransitionError(
                f'Cannot transition from {current_status} to {new_status}.',
                code='INVALID_TRANSITION',
                status_code=400,
            )

        if (
            current_status == Order.Status.PENDING
            and new_status == Order.Status.APPROVED
            and not order.all_approvals_complete
        ):
            raise OrderTransitionError(
                'All required approval steps must be completed before approval.',
                code='APPROVAL_INCOMPLETE',
                status_code=400,
            )

    @classmethod
    def _check_permission(
        cls,
        order: Order,
        current_status: str,
        new_status: str,
        user: CustomUser,
    ) -> None:
        if user.role == CustomUser.Role.ADMIN:
            return

        hospital_roles = (CustomUser.Role.HOSPITAL,)
        supplier_roles = (CustomUser.Role.SUPPLIER,)

        if new_status == Order.Status.DISPUTED:
            if user.role not in (*hospital_roles, *supplier_roles):
                raise OrderTransitionError(
                    'Only hospital or supplier users may raise a dispute.',
                    code='PERMISSION_DENIED',
                    status_code=403,
                )
            cls._assert_order_party(order, user)
            return

        permission_map: dict[str, tuple[str, ...]] = {
            Order.Status.ACCEPTED: supplier_roles,
            Order.Status.REJECTED: supplier_roles,
            Order.Status.PREPARING: supplier_roles,
            Order.Status.APPROVED: hospital_roles,
            Order.Status.CANCELLED: (*hospital_roles, *supplier_roles),
            Order.Status.CONFIRMED: supplier_roles,
            Order.Status.PAID: hospital_roles,
            Order.Status.PROCESSING: supplier_roles,
            Order.Status.SHIPPED: supplier_roles,
            Order.Status.DELIVERED: supplier_roles,
            Order.Status.COMPLETED: hospital_roles,
        }

        allowed_roles = permission_map.get(new_status)
        if allowed_roles is None:
            raise OrderTransitionError(
                f'No permission rules defined for transition to {new_status}.',
                code='PERMISSION_DENIED',
                status_code=403,
            )

        if user.role not in allowed_roles:
            raise OrderTransitionError(
                f'User role {user.role} cannot transition order to {new_status}.',
                code='PERMISSION_DENIED',
                status_code=403,
            )

        cls._assert_order_party(order, user)

    @classmethod
    def _assert_order_party(cls, order: Order, user: CustomUser) -> None:
        if user.organisation_id is None:
            raise OrderTransitionError(
                'User must belong to an organisation for this action.',
                code='PERMISSION_DENIED',
                status_code=403,
            )

        org_id = str(user.organisation_id)
        buyer_org_id = str(order.organisation_id)
        supplier_org_id = str(order.supplier.organisation_id)

        if user.role == CustomUser.Role.HOSPITAL and org_id != buyer_org_id:
            raise OrderTransitionError(
                'Hospital user does not belong to the ordering organisation.',
                code='PERMISSION_DENIED',
                status_code=403,
            )

        if user.role == CustomUser.Role.SUPPLIER and org_id != supplier_org_id:
            raise OrderTransitionError(
                'Supplier user does not belong to the order supplier organisation.',
                code='PERMISSION_DENIED',
                status_code=403,
            )

    @classmethod
    def _handle_inventory_transition(cls, order: Order, new_status: str) -> None:
        from marketplace.inventory import (
            fulfill_order_reservations,
            release_order_reservations,
        )

        if new_status in (Order.Status.REJECTED, Order.Status.CANCELLED):
            release_order_reservations(order)
        elif new_status == Order.Status.COMPLETED:
            fulfill_order_reservations(order)

    @classmethod
    def _dispatch_notifications(
        cls,
        order: Order,
        old_status: str,
        new_status: str,
        user: CustomUser,
    ) -> None:
        from orders.tasks import send_order_status_notification

        transaction.on_commit(
            lambda: send_order_status_notification.delay(
                str(order.id),
                old_status,
                new_status,
                str(user.id),
            )
        )
