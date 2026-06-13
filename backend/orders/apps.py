"""Orders app configuration."""

from django.apps import AppConfig


class OrdersConfig(AppConfig):
    """App config for procurement orders and fulfillment."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'orders'
    verbose_name = 'Orders'
