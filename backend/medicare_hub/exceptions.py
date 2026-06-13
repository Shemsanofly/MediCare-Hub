"""Custom DRF exception handler for standardised error responses."""

from typing import Any

from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from authentication.errors import AuthAPIError
from orders.errors import OrderAPIError
from payments.errors import PaymentAPIError


def _extract_validation_message(detail: Any) -> str:
    """Flatten DRF validation errors into a single message string."""
    if isinstance(detail, list):
        return str(detail[0]) if detail else 'Validation failed.'
    if isinstance(detail, dict):
        for value in detail.values():
            if isinstance(value, list) and value:
                return str(value[0])
            if isinstance(value, str):
                return value
        return 'Validation failed.'
    return str(detail)


def custom_exception_handler(exc, context) -> Response | None:
    """
    Return all API errors in the standard {error, code} format.

    AuthAPIError subclasses carry their own error text and code.
    Other DRF exceptions are mapped to the same envelope.
    """
    if isinstance(exc, (AuthAPIError, OrderAPIError, PaymentAPIError)):
        return Response(
            {'error': exc.error, 'code': exc.code},
            status=exc.status_code,
        )

    response = drf_exception_handler(exc, context)

    if response is None:
        return None

    if isinstance(exc, Throttled):
        return Response(
            {
                'error': 'Too many requests. Please try again later.',
                'code': 'RATE_LIMIT_EXCEEDED',
            },
            status=response.status_code,
        )

    code = getattr(exc, 'default_code', 'ERROR').upper()
    if hasattr(exc, 'get_codes'):
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes.upper()
        elif isinstance(codes, dict):
            for value in codes.values():
                if isinstance(value, list) and value:
                    code = str(value[0]).upper()
                    break
                if isinstance(value, str):
                    code = value.upper()
                    break

    error_message = _extract_validation_message(exc.detail)

    return Response(
        {'error': error_message, 'code': code},
        status=response.status_code,
    )
