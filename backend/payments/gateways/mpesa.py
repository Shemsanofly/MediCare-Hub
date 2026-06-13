"""M-Pesa Tanzania (Vodacom) payment gateway integration."""

from __future__ import annotations

import base64
import logging
import re
import uuid
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

from payments.constants import GATEWAY_MPESA, MPESA_OAUTH_CACHE_KEY, OAUTH_REFRESH_BUFFER_SECONDS
from payments.errors import PaymentError
from payments.gateways.base import PaymentGateway, PaymentResponse, PaymentStatus, WebhookEvent

logger = logging.getLogger(__name__)

TZ_PHONE_PATTERN = re.compile(r'^255\d{9}$')


class MpesaGateway(PaymentGateway):
    """Vodacom Tanzania M-Pesa STK Push integration."""

    name = GATEWAY_MPESA

    def __init__(self) -> None:
        self.api_key = settings.MPESA_API_KEY
        self.public_key = settings.MPESA_PUBLIC_KEY
        self.service_provider_code = settings.MPESA_SERVICE_PROVIDER_CODE
        self.initiator_identifier = settings.MPESA_INITIATOR_IDENTIFIER
        self.security_credential = settings.MPESA_SECURITY_CREDENTIAL
        self.base_url = settings.MPESA_BASE_URL.rstrip('/')
        self.allowed_ips = set(settings.MPESA_WEBHOOK_ALLOWED_IPS)

    def _get_oauth_token(self) -> str:
        cached = cache.get(MPESA_OAUTH_CACHE_KEY)
        if cached:
            return cached

        auth_string = base64.b64encode(
            f'{self.api_key}:{self.public_key}'.encode()
        ).decode()
        response = requests.post(
            f'{self.base_url}/oauth/v1/generate?grant_type=client_credentials',
            headers={'Authorization': f'Basic {auth_string}'},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        token = data['access_token']
        expires_in = int(data.get('expires_in', 3600))
        cache_timeout = max(expires_in - OAUTH_REFRESH_BUFFER_SECONDS, 60)
        cache.set(MPESA_OAUTH_CACHE_KEY, token, timeout=cache_timeout)
        return token

    @staticmethod
    def normalize_phone(phone: str) -> str:
        """Normalize phone to 255XXXXXXXXX format."""
        digits = re.sub(r'\D', '', phone)
        if digits.startswith('0') and len(digits) == 10:
            digits = f'255{digits[1:]}'
        elif digits.startswith('255'):
            pass
        elif len(digits) == 9:
            digits = f'255{digits}'
        else:
            raise PaymentError(
                'Phone must be a valid Tanzania number (255XXXXXXXXX).',
                code='INVALID_PHONE',
            )
        if not TZ_PHONE_PATTERN.match(digits):
            raise PaymentError(
                'Phone must be a valid Tanzania number (255XXXXXXXXX).',
                code='INVALID_PHONE',
            )
        return digits

    def initiate_payment(
        self,
        amount: Decimal,
        currency: str,
        reference: str,
        phone_or_card: str,
        callback_url: str,
    ) -> PaymentResponse:
        if currency != 'TZS':
            raise PaymentError(
                'M-Pesa Tanzania only supports TZS.',
                code='UNSUPPORTED_CURRENCY',
            )

        phone = self.normalize_phone(phone_or_card)
        amount_int = int(amount)
        if amount_int < 1:
            raise PaymentError('Amount must be at least 1 TZS.', code='INVALID_AMOUNT')

        token = self._get_oauth_token()
        session_id = str(uuid.uuid4())
        payload = {
            'input_Amount': str(amount_int),
            'input_Country': 'TZN',
            'input_Currency': currency,
            'input_CustomerMSISDN': phone,
            'input_ServiceProviderCode': self.service_provider_code,
            'input_ThirdPartyConversationID': reference,
            'input_TransactionReference': reference,
            'input_PurchasedItemsDesc': f'Order {reference}',
        }

        response = requests.post(
            f'{self.base_url}/openapi/ipg/v2/vodacomTZN/c2bPayment/singleStage',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'Origin': '*',
            },
            json=payload,
            timeout=30,
        )
        data = response.json()

        if response.status_code >= 400:
            logger.error(
                'M-Pesa payment initiation failed',
                extra={'reference': reference, 'response': data},
            )
            return PaymentResponse(
                success=False,
                transaction_reference=reference,
                message=data.get('output_ResponseDesc', 'M-Pesa request failed'),
                raw_response=data,
            )

        output_code = data.get('output_ResponseCode', '')
        checkout_id = data.get('output_TransactionID', session_id)
        success = output_code in ('INS-0', '0', 0)

        return PaymentResponse(
            success=success,
            transaction_reference=reference,
            gateway_reference=checkout_id,
            message=data.get('output_ResponseDesc', ''),
            raw_response=data,
        )

    def verify_payment(self, transaction_id: str) -> PaymentStatus:
        token = self._get_oauth_token()
        response = requests.get(
            f'{self.base_url}/openapi/ipg/v2/vodacomTZN/queryTransactionStatus',
            headers={'Authorization': f'Bearer {token}'},
            params={'input_TransactionID': transaction_id},
            timeout=30,
        )
        data = response.json()
        output_code = str(data.get('output_ResponseCode', ''))
        success = output_code in ('INS-0', '0')

        status_map = {
            'INS-0': 'COMPLETED',
            'INS-1': 'PENDING',
            'INS-9': 'FAILED',
        }
        return PaymentStatus(
            success=success,
            status=status_map.get(output_code, 'PROCESSING'),
            gateway_reference=transaction_id,
            message=data.get('output_ResponseDesc', ''),
            raw_response=data,
        )

    def verify_webhook_signature(
        self,
        payload: dict[str, Any],
        signature: str,
        raw_body: bytes = b'',
    ) -> bool:
        """M-Pesa uses IP whitelisting instead of payload signatures."""
        return True

    def verify_webhook_ip(self, ip_address: str) -> bool:
        if not self.allowed_ips:
            return True
        return ip_address in self.allowed_ips

    def process_webhook(
        self,
        payload: dict[str, Any],
        signature: str,
    ) -> WebhookEvent:
        stk_callback = payload.get('Body', {}).get('stkCallback', payload)
        if not stk_callback and 'input_TransactionID' in payload:
            stk_callback = payload

        result_code = stk_callback.get('ResultCode', stk_callback.get('output_ResponseCode'))
        checkout_id = (
            stk_callback.get('CheckoutRequestID')
            or stk_callback.get('input_TransactionID')
            or stk_callback.get('output_TransactionID')
            or ''
        )
        merchant_ref = (
            stk_callback.get('MerchantRequestID')
            or stk_callback.get('input_ThirdPartyConversationID')
            or ''
        )
        result_desc = stk_callback.get(
            'ResultDesc',
            stk_callback.get('output_ResponseDesc', ''),
        )

        success = str(result_code) in ('0', 'INS-0')
        amount: Decimal | None = None
        currency = 'TZS'

        metadata = stk_callback.get('CallbackMetadata', {}).get('Item', [])
        for item in metadata:
            name = item.get('Name', '')
            value = item.get('Value')
            if name == 'Amount' and value is not None:
                amount = Decimal(str(value))
            elif name == 'Currency' and value:
                currency = str(value)

        if amount is None and 'input_Amount' in stk_callback:
            amount = Decimal(str(stk_callback['input_Amount']))

        return WebhookEvent(
            event_type='payment.completed' if success else 'payment.failed',
            transaction_reference=merchant_ref,
            gateway_reference=checkout_id,
            success=success,
            amount=amount,
            currency=currency,
            message=result_desc,
            raw_payload=payload,
        )

    @staticmethod
    def webhook_accept_response() -> dict[str, Any]:
        """M-Pesa requires this response within 5 seconds."""
        return {'ResultCode': 0, 'ResultDesc': 'Accepted'}
