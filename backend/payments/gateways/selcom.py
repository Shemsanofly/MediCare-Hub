"""Selcom payment gateway integration (API v3)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import uuid
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings

from payments.constants import GATEWAY_SELCOM
from payments.errors import PaymentError
from payments.gateways.base import PaymentGateway, PaymentResponse, PaymentStatus, WebhookEvent

logger = logging.getLogger(__name__)


class SelcomGateway(PaymentGateway):
    """Selcom mobile money and card payments via API v3."""

    name = GATEWAY_SELCOM

    def __init__(self) -> None:
        self.api_key = settings.SELCOM_API_KEY
        self.api_secret = settings.SELCOM_API_SECRET
        self.vendor_id = settings.SELCOM_VENDOR_ID
        self.base_url = settings.SELCOM_BASE_URL.rstrip('/')

    def _sign_request(self, timestamp: str, nonce: str, body: str) -> str:
        signed_data = f'timestamp={timestamp}&nonce={nonce}{body}'
        return hmac.new(
            self.api_secret.encode(),
            signed_data.encode(),
            hashlib.sha256,
        ).hexdigest()

    def _request_headers(self, body: dict[str, Any]) -> dict[str, str]:
        timestamp = str(int(__import__('time').time()))
        nonce = str(uuid.uuid4())
        body_str = json.dumps(body, separators=(',', ':'))
        signature = self._sign_request(timestamp, nonce, body_str)
        return {
            'Content-Type': 'application/json',
            'Authorization': f'SELCOM {self.api_key}',
            'Digest-Method': 'HS256',
            'Digest': signature,
            'Timestamp': timestamp,
            'Nonce': nonce,
        }

    def initiate_payment(
        self,
        amount: Decimal,
        currency: str,
        reference: str,
        phone_or_card: str,
        callback_url: str,
    ) -> PaymentResponse:
        phone = re.sub(r'\D', '', phone_or_card)
        if phone.startswith('0'):
            phone = f'255{phone[1:]}'
        elif not phone.startswith('255'):
            phone = f'255{phone}'

        payload = {
            'vendor': self.vendor_id,
            'order_id': reference,
            'buyer_email': '',
            'buyer_name': '',
            'buyer_phone': phone,
            'amount': float(amount),
            'currency': currency,
            'redirect_url': callback_url,
            'cancel_url': callback_url,
            'webhook': callback_url,
            'payment_methods': 'MOBILEMONEYPULL',
            'no_of_items': 1,
        }

        response = requests.post(
            f'{self.base_url}/checkout/create-order-minimal',
            headers=self._request_headers(payload),
            json=payload,
            timeout=30,
        )
        data = response.json()

        if response.status_code >= 400 or data.get('result') != 'SUCCESS':
            logger.error(
                'Selcom payment initiation failed',
                extra={'reference': reference, 'response': data},
            )
            return PaymentResponse(
                success=False,
                transaction_reference=reference,
                message=data.get('message', 'Selcom request failed'),
                raw_response=data,
            )

        gateway_ref = data.get('data', {}).get('reference', data.get('reference', ''))
        return PaymentResponse(
            success=True,
            transaction_reference=reference,
            gateway_reference=gateway_ref,
            message=data.get('message', 'Payment initiated'),
            raw_response=data,
        )

    def verify_payment(self, transaction_id: str) -> PaymentStatus:
        payload = {'order_id': transaction_id}
        response = requests.post(
            f'{self.base_url}/checkout/order-status',
            headers=self._request_headers(payload),
            json=payload,
            timeout=30,
        )
        data = response.json()
        order_status = data.get('data', {}).get('payment_status', '').upper()
        success = order_status in ('COMPLETED', 'PAID', 'SUCCESS')

        return PaymentStatus(
            success=success,
            status=order_status or 'PROCESSING',
            gateway_reference=data.get('data', {}).get('reference', transaction_id),
            message=data.get('message', ''),
            raw_response=data,
        )

    def verify_webhook_signature(
        self,
        payload: dict[str, Any],
        signature: str,
        raw_body: bytes = b'',
    ) -> bool:
        if not signature:
            return False
        body = raw_body.decode('utf-8') if raw_body else json.dumps(
            payload, separators=(',', ':'), sort_keys=True
        )
        expected = hmac.new(
            self.api_secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def process_webhook(
        self,
        payload: dict[str, Any],
        signature: str,
    ) -> WebhookEvent:
        order_id = payload.get('order_id', payload.get('reference', ''))
        gateway_ref = payload.get('transid', payload.get('reference', ''))
        result = payload.get('result', payload.get('payment_status', '')).upper()
        success = result in ('SUCCESS', 'COMPLETED', 'PAID')

        amount_raw = payload.get('amount')
        amount = Decimal(str(amount_raw)) if amount_raw is not None else None

        return WebhookEvent(
            event_type='payment.completed' if success else 'payment.failed',
            transaction_reference=order_id,
            gateway_reference=gateway_ref,
            success=success,
            amount=amount,
            currency=payload.get('currency', 'TZS'),
            message=payload.get('message', result),
            raw_payload=payload,
        )
