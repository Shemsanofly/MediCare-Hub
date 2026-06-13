"""Abstract payment gateway interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any


@dataclass
class PaymentResponse:
    """Result of initiating a payment with a gateway."""

    success: bool
    transaction_reference: str
    gateway_reference: str = ''
    message: str = ''
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class PaymentStatus:
    """Result of querying payment status from a gateway."""

    success: bool
    status: str
    gateway_reference: str = ''
    message: str = ''
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookEvent:
    """Parsed webhook event from a payment gateway."""

    event_type: str
    transaction_reference: str
    gateway_reference: str
    success: bool
    amount: Decimal | None = None
    currency: str = ''
    message: str = ''
    raw_payload: dict[str, Any] = field(default_factory=dict)


class PaymentGateway(ABC):
    """Abstract base class for payment gateway integrations."""

    name: str

    @abstractmethod
    def initiate_payment(
        self,
        amount: Decimal,
        currency: str,
        reference: str,
        phone_or_card: str,
        callback_url: str,
    ) -> PaymentResponse:
        """Initiate a payment request with the gateway."""

    @abstractmethod
    def verify_payment(self, transaction_id: str) -> PaymentStatus:
        """Query the gateway for the current status of a transaction."""

    @abstractmethod
    def process_webhook(
        self,
        payload: dict[str, Any],
        signature: str,
    ) -> WebhookEvent:
        """Parse and validate a webhook payload from the gateway."""

    def verify_webhook_signature(
        self,
        payload: dict[str, Any],
        signature: str,
        raw_body: bytes = b'',
    ) -> bool:
        """Verify webhook authenticity. Override per gateway."""
        return True
