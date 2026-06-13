"""
Development settings for MediCare Hub.

Uses local filesystem for static and media files.
"""

from medicare_hub.settings.base import *  # noqa: F403

DEBUG = True

INTERNAL_IPS = ['127.0.0.1', 'localhost']

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

# Local file storage for development
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

CORS_ALLOW_ALL_ORIGINS = False

# Run Celery tasks synchronously when Redis/broker is unavailable (local SQLite dev).
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# In-memory channel layer for local development without Redis.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}
