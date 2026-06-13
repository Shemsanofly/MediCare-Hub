"""Payment orchestration service."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from orders.models import Order
from orders.services import CartService
from payments.constants import GATEWAY_AIRTEL, GATEWAY_MPESA, GATEWAY_SELCOM, SUPPORTED_GATEWAYS
from payments.errors import PaymentAPIError, PaymentError
from payments.escrow import EscrowService
from payments.gateways.airtel import AirtelMoneyGateway
from payments.gateways.base import PaymentGateway
from payments.gateways.mpesa import MpesaGateway
from payments.gateways.selcom import SelcomGateway
from payments.models import Payment, WebhookLog

logger = logging.getLogger(__name__)

_GATEWAY_REGISTRY: dict[str, type[PaymentGateway]] = {
    GATEWAY_MPESA: MpesaGateway,
    GATEWAY_SELCOM: SelcomGateway,
    GATEWAY_AIRTEL: AirtelMoneyGateway,
}


class PaymentService:
    """Factory and orchestration for payment gateway operations."""

    @classmethod
    def get_gateway(cls, method: str) -> PaymentGateway:
        gateway_key = method.lower().strip()
        gateway_cls = _GATEWAY_REGISTRY.get(gateway_key)
        if gateway_cls is None:
            raise PaymentAPIError(
                f'Unsupported payment method: {method}. '
                f'Supported: {", ".join(SUPPORTED_GATEWAYS)}',
                code='UNSUPPORTED_GATEWAY',
                status_code=400,
            )
        return gateway_cls()

    @classmethod
    def initiate(
        cls,
        order: Order,
        payment_method: str,
        payer_info: dict[str, Any],
    ) -> Payment:
        """
        Initiate payment with the selected gateway and create a Payment record.

        payer_info must include 'phone' for mobile money gateways.
        """
        if order.status not in (Order.Status.CONFIRMED, Order.Status.APPROVED):
            raise PaymentAPIError(
                'Payment can only be initiated for confirmed or approved orders.',
                code='INVALID_ORDER_STATUS',
                status_code=400,
            )

        phone = payer_info.get('phone', '')
        if not phone:
            raise PaymentAPIError(
                'Phone number is required for mobile money payments.',
                code='MISSING_PHONE',
                status_code=400,
            )

        gateway = cls.get_gateway(payment_method)
        transaction_ref = f'ORD-{order.id}-{uuid.uuid4().hex[:8]}'
        callback_url = (
            f'{settings.BACKEND_URL}/api/v1/payments/webhooks/{gateway.name}/'
        )

        with transaction.atomic():
            payment = Payment.objects.create(
                order=order,
                gateway=gateway.name,
                amount=order.total_amount,
                currency=order.currency,
                transaction_reference=transaction_ref,
                status=Payment.Status.PENDING,
            )

            try:
                response = gateway.initiate_payment(
                    amount=order.total_amount,
                    currency=order.currency,
                    reference=transaction_ref,
                    phone_or_card=phone,
                    callback_url=callback_url,
                )
            except PaymentError as exc:
                payment.status = Payment.Status.FAILED
                payment.gateway_response = {'error': exc.message, 'code': exc.code}
                payment.completed_at = timezone.now()
                payment.save()
                raise PaymentAPIError(exc.message, code=exc.code, status_code=400) from exc

            payment.gateway_reference = response.gateway_reference
            payment.gateway_response = response.raw_response
            payment.status = (
                Payment.Status.PROCESSING if response.success else Payment.Status.FAILED
            )
            if not response.success:
                payment.completed_at = timezone.now()
            payment.save()

        logger.info(
            'Payment initiated',
            extra={'payment': payment.to_dict(), 'success': response.success},
        )
        return payment

    @classmethod
    def handle_webhook(
        cls,
        gateway_name: str,
        payload: dict[str, Any],
        headers: dict[str, str],
        *,
        ip_address: str | None = None,
        raw_body: bytes = b'',
    ) -> WebhookLog:
        """
        Log webhook, verify signature, and dispatch async processing.

        Returns the WebhookLog record. Processing happens in a Celery task.
        """
        gateway = cls.get_gateway(gateway_name)
        signature = (
            headers.get('X-Signature', '')
            or headers.get('Digest', '')
            or headers.get('x-signature', '')
            or headers.get('digest', '')
        )

        webhook_log = WebhookLog.objects.create(
            gateway=gateway.name,
            raw_payload=payload,
            headers=headers,
            signature=signature,
            ip_address=ip_address,
        )

        if gateway.name == GATEWAY_MPESA and isinstance(gateway, MpesaGateway):
            if ip_address and not gateway.verify_webhook_ip(ip_address):
                webhook_log.processing_status = WebhookLog.ProcessingStatus.REJECTED
                webhook_log.processing_error = f'IP {ip_address} not in M-Pesa whitelist'
                webhook_log.save(update_fields=['processing_status', 'processing_error'])
                logger.warning(
                    'M-Pesa webhook rejected — IP not whitelisted',
                    extra={'ip': ip_address, 'webhook_log_id': str(webhook_log.id)},
                )
                return webhook_log

        verified = gateway.verify_webhook_signature(payload, signature, raw_body)
        webhook_log.signature_verified = verified
        if not verified and gateway.name != GATEWAY_MPESA:
            webhook_log.processing_status = WebhookLog.ProcessingStatus.REJECTED
            webhook_log.processing_error = 'Webhook signature verification failed'
            webhook_log.save(
                update_fields=['signature_verified', 'processing_status', 'processing_error']
            )
            logger.warning(
                'Webhook signature verification failed',
                extra={'gateway': gateway.name, 'webhook_log_id': str(webhook_log.id)},
            )
            return webhook_log

        webhook_log.processing_status = WebhookLog.ProcessingStatus.VERIFIED
        webhook_log.save(update_fields=['signature_verified', 'processing_status'])

        from payments.tasks import process_webhook_event

        process_webhook_event.delay(str(webhook_log.id))
        return webhook_log

    @classmethod
    def process_webhook_event(cls, webhook_log_id: str) -> None:
        """Process a verified webhook event (called from Celery)."""
        try:
            webhook_log = WebhookLog.objects.get(pk=webhook_log_id)
        except WebhookLog.DoesNotExist:
            logger.error('WebhookLog not found', extra={'webhook_log_id': webhook_log_id})
            return

        if webhook_log.processing_status == WebhookLog.ProcessingStatus.PROCESSED:
            return

        if webhook_log.processing_status == WebhookLog.ProcessingStatus.REJECTED:
            return

        gateway = cls.get_gateway(webhook_log.gateway)
        try:
            event = gateway.process_webhook(
                webhook_log.raw_payload,
                webhook_log.signature,
            )
        except Exception as exc:
            webhook_log.processing_status = WebhookLog.ProcessingStatus.FAILED
            webhook_log.processing_error = str(exc)
            webhook_log.processed_at = timezone.now()
            webhook_log.save()
            logger.exception('Webhook processing failed', extra={'webhook_log_id': webhook_log_id})
            return

        try:
            with transaction.atomic():
                payment = cls._match_payment(event, webhook_log.gateway)
                if payment is None:
                    webhook_log.processing_status = WebhookLog.ProcessingStatus.FAILED
                    webhook_log.processing_error = (
                        f'No payment found for gateway_reference={event.gateway_reference}'
                    )
                    webhook_log.processed_at = timezone.now()
                    webhook_log.save()
                    return

                payment = Payment.objects.select_for_update().get(pk=payment.pk)
                webhook_log.payment = payment
                webhook_log.save(update_fields=['payment'])

                if payment.status in (Payment.Status.COMPLETED, Payment.Status.REFUNDED):
                    webhook_log.processing_status = WebhookLog.ProcessingStatus.PROCESSED
                    webhook_log.processed_at = timezone.now()
                    webhook_log.save()
                    return

                if event.success:
                    cls._handle_payment_success(payment, event)
                else:
                    cls._handle_payment_failure(payment, event)

                webhook_log.processing_status = WebhookLog.ProcessingStatus.PROCESSED
                webhook_log.processed_at = timezone.now()
                webhook_log.save()
        except Exception as exc:
            webhook_log.processing_status = WebhookLog.ProcessingStatus.FAILED
            webhook_log.processing_error = str(exc)
            webhook_log.processed_at = timezone.now()
            webhook_log.save()
            logger.exception('Webhook event handling failed', extra={'webhook_log_id': webhook_log_id})
            raise

    @classmethod
    def _match_payment(cls, event, gateway_name: str) -> Payment | None:
        if event.gateway_reference:
            payment = Payment.objects.filter(
                gateway=gateway_name,
                gateway_reference=event.gateway_reference,
            ).first()
            if payment:
                return payment

        if event.transaction_reference:
            return Payment.objects.filter(
                transaction_reference=event.transaction_reference,
            ).first()

        return None

    @classmethod
    def _handle_payment_success(cls, payment: Payment, event) -> None:
        payment.status = Payment.Status.COMPLETED
        payment.completed_at = timezone.now()
        payment.gateway_response = event.raw_payload
        if event.gateway_reference:
            payment.gateway_reference = event.gateway_reference
        payment.save()

        order = payment.order
        EscrowService.hold_payment(order, payment)

        from orders.state_machine import OrderStateManager

        if order.status == Order.Status.CONFIRMED:
            OrderStateManager.automated_transition(
                order,
                Order.Status.PAID,
                reason='Payment confirmed via webhook',
            )

        logger.info(
            'Payment completed',
            extra={'payment': payment.to_dict()},
        )

    @classmethod
    def _handle_payment_failure(cls, payment: Payment, event) -> None:
        payment.status = Payment.Status.FAILED
        payment.completed_at = timezone.now()
        payment.gateway_response = event.raw_payload
        payment.save()

        order = payment.order
        cls._restore_cart_from_order(order)
        cls._notify_payment_failure(order, event.message)

        logger.info(
            'Payment failed',
            extra={'payment': payment.to_dict(), 'reason': event.message},
        )

    @classmethod
    def _restore_cart_from_order(cls, order: Order) -> None:
        buyer_id = str(order.buyer_id)
        for item in order.items.select_related('product', 'batch'):
            try:
                CartService.add_item(
                    user_id=buyer_id,
                    product_id=str(item.product_id),
                    batch_id=str(item.batch_id) if item.batch_id else None,
                    quantity=item.quantity_ordered,
                )
            except Exception:
                logger.warning(
                    'Could not restore cart item after payment failure',
                    extra={
                        'order_id': str(order.id),
                        'product_id': str(item.product_id),
                    },
                )

    @classmethod
    def _notify_payment_failure(cls, order: Order, reason: str) -> None:
        from payments.tasks import send_payment_failure_notification

        send_payment_failure_notification.delay(str(order.id), reason)
