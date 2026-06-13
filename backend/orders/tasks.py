"""Celery tasks for the orders app."""

import logging
import uuid

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_order_confirmation_email(self, order_id: str) -> str:
    """Send order confirmation email to the buyer after checkout."""
    from orders.models import Order

    try:
        parsed_id = uuid.UUID(str(order_id))
    except ValueError:
        logger.warning(
            'Order confirmation email skipped — invalid order id',
            extra={'order_id': order_id},
        )
        return f'order_{order_id}_invalid_id'

    try:
        order = Order.objects.select_related('buyer', 'organisation').get(pk=parsed_id)
    except Order.DoesNotExist:
        logger.warning(
            'Order confirmation email skipped — order not found',
            extra={'order_id': order_id},
        )
        return f'order_{order_id}_not_found'

    buyer = order.buyer
    subject = f'Order confirmation — {order.id}'
    message = (
        f'Hello {buyer.first_name or buyer.email},\n\n'
        f'Your order has been placed successfully.\n\n'
        f'Order ID: {order.id}\n'
        f'Status: {order.status}\n'
        f'Total: {order.total_amount} {order.currency}\n'
        f'Payment terms: {order.payment_terms}\n\n'
        f'Track your order at: {settings.FRONTEND_URL}/orders/{order.id}\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[buyer.email],
        fail_silently=False,
    )

    logger.info(
        'Order confirmation email sent',
        extra={'order': order.to_dict(), 'buyer': buyer.to_dict()},
    )
    return f'order_confirmation_sent_{order_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_order_status_notification(
    self,
    order_id: str,
    old_status: str,
    new_status: str,
    user_id: str,
) -> str:
    """Notify buyer and supplier when order status changes."""
    from authentication.models import CustomUser
    from orders.models import Order

    try:
        order = Order.objects.select_related(
            'buyer',
            'supplier',
            'supplier__organisation',
        ).get(pk=uuid.UUID(str(order_id)))
    except (Order.DoesNotExist, ValueError):
        logger.warning(
            'Order status notification skipped — order not found',
            extra={'order_id': order_id},
        )
        return f'order_{order_id}_not_found'

    recipients = {order.buyer.email}
    supplier_users = CustomUser.objects.filter(
        organisation=order.supplier.organisation,
        is_active=True,
    ).values_list('email', flat=True)
    recipients.update(supplier_users)

    subject = f'Order {order.id} status updated to {new_status}'
    message = (
        f'Order {order.id} has changed from {old_status} to {new_status}.\n\n'
        f'Updated by user: {user_id}\n'
        f'Total: {order.total_amount} {order.currency}\n\n'
        f'View order: {settings.FRONTEND_URL}/orders/{order.id}\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=list(recipients),
        fail_silently=False,
    )

    logger.info(
        'Order status notification sent',
        extra={
            'order': order.to_dict(),
            'old_status': old_status,
            'new_status': new_status,
        },
    )
    return f'order_status_notification_sent_{order_id}'
