"""
ASGI config for medicare_hub project.

Exposes HTTP via Django and WebSocket routes for in-app notifications.
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_hub.settings.development')

django_asgi_app = get_asgi_application()

from notifications.middleware import JWTAuthMiddleware  # noqa: E402
from notifications.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
