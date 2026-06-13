"""Airtel Money payment gateway integration."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import uuid
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

from payments.constants import AIRTEL_OAUTH_CACHE_KEY, GATEWAY_AIRTEL, OAUTH_REFRESH_BUFFER_SECONDS
from payments.errors import PaymentError
from payments.gateways.base import PaymentGateway, PaymentResponse, PaymentStatus, WebhookEvent

logger = logging.getLogger(__name__)


class AirtelMoneyGateway(PaymentGateway):
    """Airtel Money collection API integration."""

    name = GATEWAY_AIRTEL

    def __init__(self) -> None:
        self.client_id = settings.AIRTEL_CLIENT_ID
        self.client_secret = settings.AIRTEL_CLIENT_SECRET
        self.merchant_pin = settings.AIRTEL_MERCHANT_PIN
        self.base_url = settings.AIRTEL_BASE_URL.rstrip('/')
        self.country = settings.AIRTEL_COUNTRY
        self.currency = settings.AIRTEL_CURRENCY

    def _get_oauth_token(self) -> str:
        cached = cache.get(AIRTEL_OAUTH_CACHE_KEY)
        if cached:
            return cached

        response = requests.post(
            f'{self.base_url}/auth/oauth2/token',
            headers={'Content-Type': 'application/json', 'Accept': '*/*'},
            json={
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'grant_type': 'client_credentials',
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        token = data['access_token']
        expires_in = int(data.get('expires_in', 3600))
        cache_timeout = max(expires_in - OAUTH_REFRESH_BUFFER_SECONDS, 60)
        cache.set(AIRTEL_OAUTH_CACHE_KEY, token, timeout=cache_timeout)
        return token

    @staticmethod
    def normalize_phone(phone: str) -> str:
        digits = re.sub(r'\D', '', phone)
        if digits.startswith('0') and len(digits) == 10:
            return digits[1:]
        if digits.startswith('255') and len(digits) == 12:
            return digits[3:]
        return digits

    def initiate_payment(
        self,
        amount: Decimal,
        currency: str,
        reference: str,
        phone_or_card: str,
        callback_url: str,
    ) -> PaymentResponse:
        phone = self.normalize_phone(phone_or_card)
        token = self._get_oauth_token()
        transaction_id = str(uuid.uuid4())

        payload = {
            'reference': reference,
            'subscriber': {
                'country': self.country,
                'currency': currency,
                'msisdn': phone,
            },
            'transaction': {
                'amount': float(amount),
                'country': self.country,
                'currency': currency,
                'id': transaction_id,
            },
        }

        response = requests.post(
            f'{self.base_url}/merchant/v1/payments/',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'X-Country': self.country,
                'X-Currency': currency,
            },
            json=payload,
            timeout=30,
        )
        data = response.json()
        status_info = data.get('status', {})
        success = status_info.get('code') == '200' or status_info.get('success') is True

        if not success:
            logger.error(
                'Airtel payment initiation failed',
                extra={'reference': reference, 'response': data},
            )

        return PaymentResponse(
            success=success,
            transaction_reference=reference,
            gateway_reference=transaction_id,
            message=status_info.get('message', ''),
            raw_response=data,
        )

    def verify_payment(self, transaction_id: str) -> PaymentStatus:
        token = self._get_oauth_token()
        response = requests.get(
            f'{self.base_url}/standard/v1/payments/{transaction_id}',
            headers={
                'Authorization': f'Bearer {token}',
                'X-Country': self.country,
                'X-Currency': self.currency,
            },
            timeout=30,
        )
        data = response.json()
        txn_data = data.get('data', {}).get('transaction', {})
        status_code = txn_data.get('status', '').upper()
        success = status_code == 'TS'

        return PaymentStatus(
            success=success,
            status='COMPLETED' if success else status_code or 'PROCESSING',
            gateway_reference=transaction_id,
            message=data.get('status', {}).get('message', ''),
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
        secret = settings.AIRTEL_WEBHOOK_SECRET
        body = raw_body if raw_body else str(payload).encode()
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def process_webhook(
        self,
        payload: dict[str, Any],
        signature: str,
    ) -> WebhookEvent:
        transaction = payload.get('transaction', payload)
        txn_id = transaction.get('id', transaction.get('airtel_money_id', ''))
        reference = transaction.get('reference', payload.get('reference', ''))
        status_code = transaction.get('status_code', transaction.get('status', ''))
        success = str(status_code).upper() in ('TS', 'SUCCESS', '200')

        amount_raw = transaction.get('amount')
        amount = Decimal(str(amount_raw)) if amount_raw is not None else None

        return WebhookEvent(
            event_type='payment.completed' if success else 'payment.failed',
            transaction_reference=reference,
            gateway_reference=txn_id,
            success=success,
            amount=amount,
            currency=transaction.get('currency', self.currency),
            message=transaction.get('message', str(status_code)),
            raw_payload=payload,
        )
