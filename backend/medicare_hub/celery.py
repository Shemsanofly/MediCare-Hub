"""
Celery application configuration for MediCare Hub.
"""

import os

from celery import Celery

os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE',
    'medicare_hub.settings.development',
)

app = Celery('medicare_hub')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
