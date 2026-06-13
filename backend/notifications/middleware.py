"""JWT authentication middleware for Django Channels WebSocket connections."""

from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def _get_user(user_id: str):
    from authentication.models import CustomUser

    try:
        return CustomUser.objects.get(pk=user_id, is_active=True)
    except CustomUser.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Authenticate WebSocket connections using a JWT access token."""

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        token = parse_qs(query_string).get('token', [None])[0]

        if token:
            try:
                validated = AccessToken(token)
                scope['user'] = await _get_user(str(validated['user_id']))
            except (InvalidToken, TokenError, KeyError):
                scope['user'] = AnonymousUser()
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)
