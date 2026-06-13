"""Payments API views with explicit RBAC permissions."""

from __future__ import annotations

import json

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminUser, IsHospitalOrAdmin, IsOrganisationMember
from orders.models import Order
from payments.errors import PaymentAPIError
from payments.gateways.mpesa import MpesaGateway
from payments.models import Payment
from payments.serializers import InitiatePaymentSerializer, PaymentSerializer
from payments.services import PaymentService


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


class PaymentViewSet(viewsets.ViewSet):
    """Payment records scoped to the user's organisation."""

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'create', 'initiate'):
            return [IsAuthenticated(), IsHospitalOrAdmin(), IsOrganisationMember()]
        return [IsAuthenticated(), IsAdminUser()]

    def list(self, request: Request) -> Response:
        org_id = request.user.organisation_id
        payments = (
            Payment.objects.filter(order__organisation_id=org_id)
            .select_related('order')
            .order_by('-initiated_at')[:50]
        )
        data = [
            PaymentSerializer(
                {
                    'id': p.id,
                    'order_id': p.order_id,
                    'gateway': p.gateway,
                    'amount': p.amount,
                    'currency': p.currency,
                    'transaction_reference': p.transaction_reference,
                    'gateway_reference': p.gateway_reference,
                    'status': p.status,
                    'initiated_at': p.initiated_at,
                    'completed_at': p.completed_at,
                }
            ).data
            for p in payments
        ]
        return Response({'results': data}, status=status.HTTP_200_OK)

    def retrieve(self, request: Request, pk: str = None) -> Response:
        try:
            payment = Payment.objects.select_related('order').get(pk=pk)
        except Payment.DoesNotExist:
            return Response(
                {'error': 'Payment not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if (
            request.user.role != 'ADMIN'
            and str(payment.order.organisation_id) != str(request.user.organisation_id)
        ):
            return Response(
                {'error': 'Permission denied.', 'code': 'PERMISSION_DENIED'},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(
            PaymentSerializer(
                {
                    'id': payment.id,
                    'order_id': payment.order_id,
                    'gateway': payment.gateway,
                    'amount': payment.amount,
                    'currency': payment.currency,
                    'transaction_reference': payment.transaction_reference,
                    'gateway_reference': payment.gateway_reference,
                    'status': payment.status,
                    'initiated_at': payment.initiated_at,
                    'completed_at': payment.completed_at,
                }
            ).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='initiate')
    def initiate(self, request: Request) -> Response:
        serializer = InitiatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            order = Order.objects.get(pk=data['order_id'])
        except Order.DoesNotExist:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if str(order.organisation_id) != str(request.user.organisation_id):
            return Response(
                {'error': 'Permission denied.', 'code': 'PERMISSION_DENIED'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment = PaymentService.initiate(
                order=order,
                payment_method=data['payment_method'],
                payer_info={'phone': data['phone']},
            )
        except PaymentAPIError as exc:
            return Response(
                {'error': exc.error, 'code': exc.code},
                status=exc.status_code,
            )

        return Response(
            PaymentSerializer(
                {
                    'id': payment.id,
                    'order_id': payment.order_id,
                    'gateway': payment.gateway,
                    'amount': payment.amount,
                    'currency': payment.currency,
                    'transaction_reference': payment.transaction_reference,
                    'gateway_reference': payment.gateway_reference,
                    'status': payment.status,
                    'initiated_at': payment.initiated_at,
                    'completed_at': payment.completed_at,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class MpesaWebhookView(APIView):
    """
    M-Pesa STK callback webhook.

    Must return {ResultCode: 0, ResultDesc: 'Accepted'} within 5 seconds.
    All processing happens asynchronously via Celery after logging.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request) -> Response:
        raw_body = request.body
        try:
            payload = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            payload = {}

        ip_address = _get_client_ip(request)
        headers = {key: value for key, value in request.headers.items()}

        PaymentService.handle_webhook(
            gateway_name='mpesa',
            payload=payload,
            headers=headers,
            ip_address=ip_address,
            raw_body=raw_body,
        )

        return Response(MpesaGateway.webhook_accept_response(), status=status.HTTP_200_OK)


class SelcomWebhookView(APIView):
    """Selcom payment webhook with HMAC signature verification."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request) -> Response:
        raw_body = request.body
        try:
            payload = json.loads(raw_body) if raw_body else request.data
        except json.JSONDecodeError:
            payload = request.data

        signature = (
            request.headers.get('Digest', '')
            or request.headers.get('X-Signature', '')
        )
        headers = {key: value for key, value in request.headers.items()}

        webhook_log = PaymentService.handle_webhook(
            gateway_name='selcom',
            payload=payload,
            headers=headers,
            ip_address=_get_client_ip(request),
            raw_body=raw_body,
        )

        if webhook_log.processing_status == 'REJECTED':
            return Response(
                {'error': 'Signature verification failed.', 'code': 'INVALID_SIGNATURE'},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response({'status': 'accepted'}, status=status.HTTP_200_OK)


class AirtelWebhookView(APIView):
    """Airtel Money payment webhook with signature verification."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request: Request) -> Response:
        raw_body = request.body
        try:
            payload = json.loads(raw_body) if raw_body else request.data
        except json.JSONDecodeError:
            payload = request.data

        signature = request.headers.get('X-Signature', '')
        headers = {key: value for key, value in request.headers.items()}

        webhook_log = PaymentService.handle_webhook(
            gateway_name='airtel',
            payload=payload,
            headers=headers,
            ip_address=_get_client_ip(request),
            raw_body=raw_body,
        )

        if webhook_log.processing_status == 'REJECTED':
            return Response(
                {'error': 'Signature verification failed.', 'code': 'INVALID_SIGNATURE'},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response({'status': 'accepted'}, status=status.HTTP_200_OK)
