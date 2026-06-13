"""Celery tasks for payment processing and escrow notifications."""

from __future__ import annotations

import logging
import uuid

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

ESCROW_AUTO_RELEASE_SECONDS = 72 * 60 * 60


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_webhook_event(self, webhook_log_id: str) -> str:
    """Process a verified webhook event asynchronously."""
    from payments.services import PaymentService

    try:
        PaymentService.process_webhook_event(webhook_log_id)
    except Exception as exc:
        logger.exception(
            'Webhook processing task failed',
            extra={'webhook_log_id': webhook_log_id},
        )
        raise self.retry(exc=exc) from exc

    return f'webhook_processed_{webhook_log_id}'


@shared_task
def schedule_escrow_auto_release(order_id: str) -> str:
    """Schedule escrow auto-release 72 hours after order is shipped."""
    auto_release_escrow.apply_async(
        args=[order_id],
        countdown=ESCROW_AUTO_RELEASE_SECONDS,
    )
    return f'auto_release_scheduled_{order_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def auto_release_escrow(self, order_id: str) -> str:
    """Auto-release escrow funds 72 hours after SHIPPED if no signed GRN."""
    from orders.models import Order
    from payments.escrow import EscrowService

    try:
        order = Order.objects.get(pk=uuid.UUID(str(order_id)))
    except (Order.DoesNotExist, ValueError):
        return f'order_{order_id}_not_found'

    try:
        payout = EscrowService.auto_release(order)
    except Exception as exc:
        logger.exception('Auto-release failed', extra={'order_id': order_id})
        raise self.retry(exc=exc) from exc

    if payout is None:
        return f'auto_release_skipped_{order_id}'
    return f'auto_release_completed_{order_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_payment_failure_notification(self, order_id: str, reason: str) -> str:
    """Notify buyer when payment fails."""
    from orders.models import Order

    try:
        order = Order.objects.select_related('buyer').get(pk=uuid.UUID(str(order_id)))
    except (Order.DoesNotExist, ValueError):
        return f'order_{order_id}_not_found'

    buyer = order.buyer
    subject = f'Payment failed — Order {order.id}'
    message = (
        f'Hello {buyer.first_name or buyer.email},\n\n'
        f'Your payment for order {order.id} was not successful.\n\n'
        f'Reason: {reason}\n'
        f'Amount: {order.total_amount} {order.currency}\n\n'
        f'Your cart items have been restored. Please try again at:\n'
        f'{settings.FRONTEND_URL}/orders/{order.id}\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[buyer.email],
        fail_silently=False,
    )
    return f'payment_failure_notified_{order_id}'


@shared_task
def notify_supplier_payment_secured(order_id: str) -> str:
    """Notify supplier that payment is secured in escrow."""
    from authentication.models import CustomUser
    from orders.models import Order

    try:
        order = Order.objects.select_related('supplier', 'supplier__organisation').get(
            pk=uuid.UUID(str(order_id))
        )
    except (Order.DoesNotExist, ValueError):
        return f'order_{order_id}_not_found'

    recipients = CustomUser.objects.filter(
        organisation=order.supplier.organisation,
        is_active=True,
    ).values_list('email', flat=True)

    subject = f'Payment secured — Order {order.id}'
    message = (
        f'Payment of {order.total_amount} {order.currency} has been secured '
        f'in escrow for order {order.id}.\n\n'
        f'You may proceed with processing and shipping.\n\n'
        f'— MediCare Hub'
    )

    if recipients:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=list(recipients),
            fail_silently=False,
        )
    return f'supplier_notified_{order_id}'


@shared_task
def notify_escrow_released(order_id: str, release_trigger: str) -> str:
    """Notify buyer and supplier when escrow funds are released."""
    from authentication.models import CustomUser
    from orders.models import Order

    try:
        order = Order.objects.select_related(
            'buyer', 'supplier', 'supplier__organisation'
        ).get(pk=uuid.UUID(str(order_id)))
    except (Order.DoesNotExist, ValueError):
        return f'order_{order_id}_not_found'

    recipients = {order.buyer.email}
    supplier_emails = CustomUser.objects.filter(
        organisation=order.supplier.organisation,
        is_active=True,
    ).values_list('email', flat=True)
    recipients.update(supplier_emails)

    subject = f'Escrow released — Order {order.id}'
    message = (
        f'Escrow funds of {order.total_amount} {order.currency} for order '
        f'{order.id} have been released.\n\n'
        f'Release trigger: {release_trigger}\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=list(recipients),
        fail_silently=False,
    )
    return f'escrow_release_notified_{order_id}'


@shared_task
def notify_admin_dispute(order_id: str, reason: str) -> str:
    """Notify platform admins about an escrow dispute."""
    from authentication.models import CustomUser
    from orders.models import Order

    try:
        order = Order.objects.get(pk=uuid.UUID(str(order_id)))
    except (Order.DoesNotExist, ValueError):
        return f'order_{order_id}_not_found'

    admin_emails = CustomUser.objects.filter(
        role=CustomUser.Role.ADMIN,
        is_active=True,
    ).values_list('email', flat=True)

    subject = f'Escrow dispute — Order {order.id}'
    message = (
        f'An escrow dispute has been raised for order {order.id}.\n\n'
        f'Reason: {reason}\n'
        f'Amount held: {order.total_amount} {order.currency}\n\n'
        f'Please review in the admin panel.\n\n'
        f'— MediCare Hub'
    )

    if admin_emails:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=list(admin_emails),
            fail_silently=False,
        )
    return f'admin_dispute_notified_{order_id}'
