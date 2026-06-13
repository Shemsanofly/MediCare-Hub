"""MediCare Hub project package."""

from medicare_hub.celery import app as celery_app

__all__ = ('celery_app',)
