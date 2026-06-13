"""Notification domain errors."""


class NotificationError(Exception):
    """Base notification processing error."""

    def __init__(self, message: str, code: str = 'NOTIFICATION_ERROR') -> None:
        self.message = message
        self.code = code
        super().__init__(message)
