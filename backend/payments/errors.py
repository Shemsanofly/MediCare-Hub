"""Payment domain errors."""


class PaymentError(Exception):
    """Base payment processing error."""

    def __init__(self, message: str, code: str = 'PAYMENT_ERROR') -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class PaymentAPIError(Exception):
    """API-facing payment error with HTTP status code."""

    def __init__(
        self,
        error: str,
        code: str = 'PAYMENT_ERROR',
        status_code: int = 400,
    ) -> None:
        self.error = error
        self.code = code
        self.status_code = status_code
        super().__init__(error)
