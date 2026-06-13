"""Marketplace app configuration."""

from django.apps import AppConfig


class MarketplaceConfig(AppConfig):
    """App config for product catalog and supplier listings."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'marketplace'
    verbose_name = 'Marketplace'

    def ready(self) -> None:
        import marketplace.signals  # noqa: F401
