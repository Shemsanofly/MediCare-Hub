"""Standardised authentication error codes."""

from rest_framework import status
from rest_framework.exceptions import APIException


class AuthAPIError(APIException):
    """API exception that always serialises to {error, code}."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'AUTH_ERROR'
    default_detail = 'An authentication error occurred.'

    def __init__(
        self,
        error: str,
        code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        self.error = error
        self.code = code or self.default_code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=error, code=self.code)


class EmailAlreadyExistsError(AuthAPIError):
    default_code = 'EMAIL_ALREADY_EXISTS'
    status_code = status.HTTP_409_CONFLICT


class InvalidCredentialsError(AuthAPIError):
    default_code = 'INVALID_CREDENTIALS'
    status_code = status.HTTP_401_UNAUTHORIZED


class AccountDeactivatedError(AuthAPIError):
    default_code = 'ACCOUNT_DEACTIVATED'
    status_code = status.HTTP_403_FORBIDDEN


class InvalidTokenError(AuthAPIError):
    default_code = 'INVALID_TOKEN'
    status_code = status.HTTP_400_BAD_REQUEST


class TokenExpiredError(AuthAPIError):
    default_code = 'TOKEN_EXPIRED'
    status_code = status.HTTP_400_BAD_REQUEST


class EmailAlreadyVerifiedError(AuthAPIError):
    default_code = 'EMAIL_ALREADY_VERIFIED'
    status_code = status.HTTP_400_BAD_REQUEST


class RateLimitExceededError(AuthAPIError):
    default_code = 'RATE_LIMIT_EXCEEDED'
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class ValidationFailedError(AuthAPIError):
    default_code = 'VALIDATION_ERROR'
    status_code = status.HTTP_400_BAD_REQUEST


class PermissionDeniedError(AuthAPIError):
    default_code = 'PERMISSION_DENIED'
    status_code = status.HTTP_403_FORBIDDEN
