"""Payment app signals."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from orders.models import Order, OrderStatusHistory


@receiver(post_save, sender=OrderStatusHistory)
def schedule_escrow_auto_release_on_shipped(sender, instance, created, **kwargs):
    """Schedule escrow auto-release 72 hours after order ships."""
    if not created:
        return
    if instance.to_status != Order.Status.SHIPPED:
        return

    from payments.tasks import schedule_escrow_auto_release

    schedule_escrow_auto_release.delay(str(instance.order_id))
