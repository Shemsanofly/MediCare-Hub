"""
Base Django settings shared across all MediCare Hub environments.

Secrets and environment-specific values are loaded via python-decouple.
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

from orders.constants import DEFAULT_APPROVAL_THRESHOLDS

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'storages',
]

LOCAL_APPS = [
    'authentication',
    'marketplace',
    'orders',
    'payments',
    'notifications',
    'analytics',
    'dashboard',
    'admin_portal',
]

INSTALLED_APPS = ['daphne'] + DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'medicare_hub.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'medicare_hub.wsgi.application'
ASGI_APPLICATION = 'medicare_hub.asgi.application'

AUTH_USER_MODEL = 'authentication.CustomUser'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': (
            'django.contrib.auth.password_validation'
            '.UserAttributeSimilarityValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation'
            '.MinimumLengthValidator'
        ),
        'OPTIONS': {'min_length': 10},
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation'
            '.CommonPasswordValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation'
            '.NumericPasswordValidator'
        ),
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Nairobi'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_VERSIONING_CLASS': 'rest_framework.versioning.URLPathVersioning',
    'DEFAULT_VERSION': 'v1',
    'ALLOWED_VERSIONS': ['v1'],
    'DEFAULT_PAGINATION_CLASS': (
        'rest_framework.pagination.PageNumberPagination'
    ),
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'medicare_hub.exceptions.custom_exception_handler',
    'DEFAULT_THROTTLE_RATES': {
        'login': '5/m',
        'password_reset': '3/h',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=15, cast=int)
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)
    ),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

JWT_REFRESH_COOKIE_NAME = config('JWT_REFRESH_COOKIE_NAME', default='refresh_token')
JWT_REFRESH_COOKIE_HTTPONLY = True
JWT_REFRESH_COOKIE_SECURE = config('JWT_REFRESH_COOKIE_SECURE', default=False, cast=bool)
JWT_REFRESH_COOKIE_SAMESITE = config('JWT_REFRESH_COOKIE_SAMESITE', default='Lax')
JWT_REFRESH_COOKIE_PATH = '/api/v1/auth/'

FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:3000')
BACKEND_URL = config('BACKEND_URL', default='http://localhost:8000')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@medicarehub.co.tz')

# Notification providers
SENDGRID_API_KEY = config('SENDGRID_API_KEY', default='')
AFRICAS_TALKING_API_KEY = config('AFRICAS_TALKING_API_KEY', default='')
AFRICAS_TALKING_USERNAME = config('AFRICAS_TALKING_USERNAME', default='sandbox')
AFRICAS_TALKING_SHORTCODE = config('AFRICAS_TALKING_SHORTCODE', default='')
WHATSAPP_API_TOKEN = config('WHATSAPP_API_TOKEN', default='')
WHATSAPP_PHONE_NUMBER_ID = config('WHATSAPP_PHONE_NUMBER_ID', default='')
WHATSAPP_API_VERSION = config('WHATSAPP_API_VERSION', default='v21.0')

# Django Channels — in-app WebSocket notifications
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [config('REDIS_URL', default='redis://localhost:6379/2')],
        },
    },
}

# M-Pesa Tanzania (Vodacom)
MPESA_API_KEY = config('MPESA_API_KEY', default='')
MPESA_PUBLIC_KEY = config('MPESA_PUBLIC_KEY', default='')
MPESA_SERVICE_PROVIDER_CODE = config('MPESA_SERVICE_PROVIDER_CODE', default='')
MPESA_INITIATOR_IDENTIFIER = config('MPESA_INITIATOR_IDENTIFIER', default='')
MPESA_SECURITY_CREDENTIAL = config('MPESA_SECURITY_CREDENTIAL', default='')
MPESA_BASE_URL = config('MPESA_BASE_URL', default='https://openapi.m-pesa.com')
MPESA_WEBHOOK_ALLOWED_IPS = config(
    'MPESA_WEBHOOK_ALLOWED_IPS',
    default='',
    cast=Csv(),
)

# Selcom API v3
SELCOM_API_KEY = config('SELCOM_API_KEY', default='')
SELCOM_API_SECRET = config('SELCOM_API_SECRET', default='')
SELCOM_VENDOR_ID = config('SELCOM_VENDOR_ID', default='')
SELCOM_BASE_URL = config('SELCOM_BASE_URL', default='https://apigw.selcommobile.com/v1')

# Airtel Money
AIRTEL_CLIENT_ID = config('AIRTEL_CLIENT_ID', default='')
AIRTEL_CLIENT_SECRET = config('AIRTEL_CLIENT_SECRET', default='')
AIRTEL_MERCHANT_PIN = config('AIRTEL_MERCHANT_PIN', default='')
AIRTEL_BASE_URL = config('AIRTEL_BASE_URL', default='https://openapiuat.airtel.africa')
AIRTEL_COUNTRY = config('AIRTEL_COUNTRY', default='TZ')
AIRTEL_CURRENCY = config('AIRTEL_CURRENCY', default='TZS')
AIRTEL_WEBHOOK_SECRET = config('AIRTEL_WEBHOOK_SECRET', default='')

# CORS — React frontend
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000',
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True

# Celery
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config(
    'CELERY_RESULT_BACKEND',
    default='redis://localhost:6379/1',
)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Order approval thresholds (TZS)
ORDER_APPROVAL_THRESHOLDS = DEFAULT_APPROVAL_THRESHOLDS

# Redis cache for product list responses
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': config('REDIS_URL', default='redis://localhost:6379/2'),
        'TIMEOUT': 300,
    }
}

CELERY_BEAT_SCHEDULE = {
    'check-supplier-license-expiry-daily': {
        'task': 'marketplace.tasks.check_supplier_license_expiry',
        'schedule': timedelta(days=1),
    },
}

# Structured JSON logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'medicare_hub.log_formatters.JsonFormatter',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': config('LOG_LEVEL', default='INFO'),
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': config('DJANGO_LOG_LEVEL', default='INFO'),
            'propagate': False,
        },
        'celery': {
            'handlers': ['console'],
            'level': config('CELERY_LOG_LEVEL', default='INFO'),
            'propagate': False,
        },
    },
}

# Django admin — staff-only access is enforced by AdminSite.has_permission
ADMIN_SITE_HEADER = 'MediCare Hub Administration'
ADMIN_SITE_TITLE = 'MediCare Hub Admin'
ADMIN_INDEX_TITLE = 'Platform Management'
