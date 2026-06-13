"""Celery tasks for the marketplace app."""

import logging
import uuid
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_batch_expiry_alert(self, batch_id: str, days_until_expiry: int) -> str:
    """Notify stakeholders when a product batch is nearing expiry."""
    from marketplace.models import ProductBatch

    try:
        batch = ProductBatch.objects.select_related(
            'product',
            'product__supplier',
            'product__supplier__organisation',
        ).get(pk=batch_id)
    except ProductBatch.DoesNotExist:
        return f'batch_{batch_id}_not_found'

    subject = f'Batch expiry alert: {batch.product.name}'
    message = (
        f'Batch {batch.batch_number} for {batch.product.name} '
        f'expires on {batch.expiry_date} ({days_until_expiry} days remaining).\n\n'
        f'Supplier: {batch.product.supplier.organisation.name}\n'
        f'Quantity available: {batch.available_quantity}\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[settings.DEFAULT_FROM_EMAIL],
        fail_silently=False,
    )

    logger.warning(
        'Batch expiry alert sent',
        extra={
            'batch_id': batch_id,
            'days_until_expiry': days_until_expiry,
        },
    )
    return f'batch_expiry_alert_sent_{batch_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_supplier_suspension_email(self, supplier_id: str, reason: str) -> str:
    """Notify a supplier organisation that their account has been suspended."""
    from authentication.models import CustomUser
    from marketplace.models import Supplier

    try:
        supplier = Supplier.objects.select_related('organisation').get(pk=supplier_id)
    except Supplier.DoesNotExist:
        return f'supplier_{supplier_id}_not_found'

    recipient_emails = list(
        CustomUser.objects.filter(
            organisation=supplier.organisation,
            is_active=True,
        ).values_list('email', flat=True)
    )
    if not recipient_emails:
        return f'supplier_{supplier_id}_no_recipients'

    subject = 'MediCare Hub supplier account suspended'
    message = (
        f'Your supplier account ({supplier.organisation.name}) has been suspended.\n\n'
        f'Reason: {reason}\n\n'
        f'Please contact platform support for more information.\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipient_emails,
        fail_silently=False,
    )
    return f'supplier_suspension_email_sent_{supplier_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_supplier_license_renewal_reminder(self, supplier_id: str) -> str:
    """Send TMDA license renewal reminder to a supplier."""
    from authentication.models import CustomUser
    from marketplace.models import Supplier

    try:
        supplier = Supplier.objects.select_related('organisation').get(pk=supplier_id)
    except Supplier.DoesNotExist:
        return f'supplier_{supplier_id}_not_found'

    recipient_emails = list(
        CustomUser.objects.filter(
            organisation=supplier.organisation,
            is_active=True,
        ).values_list('email', flat=True)
    )
    if not recipient_emails:
        return f'supplier_{supplier_id}_no_recipients'

    subject = 'TMDA license renewal reminder'
    message = (
        f'Your TMDA license ({supplier.tmda_license_number}) '
        f'expires on {supplier.license_expiry_date}.\n\n'
        f'Please renew your license within 30 days to maintain verified status.\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipient_emails,
        fail_silently=False,
    )
    return f'license_renewal_reminder_sent_{supplier_id}'


@shared_task
def check_supplier_license_expiry() -> str:
    """
    Daily task: find suppliers whose TMDA license expires within 30 days
    and send renewal reminder emails.
    """
    from marketplace.models import Supplier

    today = timezone.now().date()
    window_end = today + timedelta(days=30)

    expiring_suppliers = Supplier.objects.filter(
        verification_status=Supplier.VerificationStatus.VERIFIED,
        license_expiry_date__isnull=False,
        license_expiry_date__gte=today,
        license_expiry_date__lte=window_end,
    )

    count = 0
    for supplier in expiring_suppliers.iterator():
        send_supplier_license_renewal_reminder.delay(str(supplier.pk))
        count += 1

    logger.info(
        'Supplier license expiry check completed',
        extra={'reminders_queued': count},
    )
    return f'license_expiry_reminders_queued_{count}'


@shared_task
def schedule_supplier_verification_expiry_check(supplier_id: str) -> str:
    """
    Re-check supplier verification status 90 days after approval.

    Suspends suppliers whose license has expired.
    """
    from marketplace.models import Supplier

    try:
        parsed_id = uuid.UUID(str(supplier_id))
    except ValueError:
        return f'supplier_{supplier_id}_invalid_id'

    try:
        supplier = Supplier.objects.select_related('organisation').get(pk=parsed_id)
    except Supplier.DoesNotExist:
        return f'supplier_{supplier_id}_not_found'

    today = timezone.now().date()
    if (
        supplier.verification_status == Supplier.VerificationStatus.VERIFIED
        and supplier.license_expiry_date
        and supplier.license_expiry_date < today
    ):
        supplier.verification_status = Supplier.VerificationStatus.SUSPENDED
        supplier.suspension_reason = 'TMDA license expired during verification period.'
        supplier.save(
            update_fields=['verification_status', 'suspension_reason', 'updated_at']
        )
        supplier.organisation.is_verified = False
        supplier.organisation.save(update_fields=['is_verified'])
        send_supplier_suspension_email.delay(
            str(supplier.pk),
            supplier.suspension_reason,
        )
        return f'supplier_{supplier_id}_suspended_expired_license'

    return f'supplier_{supplier_id}_verification_check_ok'
