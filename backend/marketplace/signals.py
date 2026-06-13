"""Marketplace signals for expiry alerts and cache invalidation."""

import hashlib
import logging

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from marketplace.models import Product, ProductBatch

logger = logging.getLogger(__name__)

EXPIRY_ALERT_DAYS = 90
PRODUCT_LIST_CACHE_PREFIX = 'marketplace:product_list:'


def invalidate_product_list_cache() -> None:
    """Invalidate all cached product list responses."""
    if hasattr(cache, 'delete_pattern'):
        cache.delete_pattern(f'{PRODUCT_LIST_CACHE_PREFIX}*')
        return
    logger.info('Product list cache invalidation requested (pattern delete unavailable)')


@receiver(pre_save, sender=ProductBatch)
def alert_batch_expiring_soon(
    sender,
    instance: ProductBatch,
    **kwargs,
) -> None:
    """Alert when a batch expiry date is within 90 days."""
    if instance.expiry_date is None:
        return

    if instance.pk:
        previous = ProductBatch.objects.filter(pk=instance.pk).values('expiry_date').first()
        if previous and previous['expiry_date'] == instance.expiry_date:
            return

    today = timezone.now().date()
    days_until_expiry = (instance.expiry_date - today).days
    if days_until_expiry > EXPIRY_ALERT_DAYS:
        return

    from marketplace.tasks import send_batch_expiry_alert

    send_batch_expiry_alert.delay(str(instance.pk), days_until_expiry)

    logger.warning(
        'Product batch expiring within alert window',
        extra={
            'batch_id': str(instance.pk),
            'product_id': str(instance.product_id),
            'expiry_date': instance.expiry_date.isoformat(),
            'days_until_expiry': days_until_expiry,
        },
    )


@receiver(post_save, sender=Product)
@receiver(post_delete, sender=Product)
def invalidate_cache_on_product_change(sender, **kwargs) -> None:
    """Invalidate product list cache when a product is created, updated, or deleted."""
    invalidate_product_list_cache()


def build_product_list_cache_key(params: dict) -> str:
    """Build a deterministic Redis cache key from query parameters."""
    encoded = '&'.join(f'{key}={value}' for key, value in sorted(params.items()))
    digest = hashlib.md5(encoded.encode(), usedforsecurity=False).hexdigest()
    return f'{PRODUCT_LIST_CACHE_PREFIX}{digest}'
