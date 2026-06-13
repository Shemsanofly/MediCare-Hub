"""Standardised order domain errors."""

from rest_framework import status
from rest_framework.exceptions import APIException


class OrderAPIError(APIException):
    """API exception that always serialises to {error, code}."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'ORDER_ERROR'
    default_detail = 'An order error occurred.'

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


class OrderTransitionError(OrderAPIError):
    """Raised when an order status transition is invalid or unauthorised."""

    default_code = 'ORDER_TRANSITION_ERROR'
    status_code = status.HTTP_409_CONFLICT


class CartError(OrderAPIError):
    """Raised when cart operations fail validation."""

    default_code = 'CART_ERROR'


class CheckoutError(OrderAPIError):
    """Raised when checkout cannot complete."""

    default_code = 'CHECKOUT_ERROR'
