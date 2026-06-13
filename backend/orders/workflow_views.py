"""Dedicated order workflow transition endpoints."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsHospitalOrAdmin, IsSupplierOrAdmin
from orders.models import Order
from orders.serializers import OrderRejectSerializer
from orders.workflow import get_order_for_user, transition_order


class SupplierOrderActionView(APIView):
    """Base view for supplier-owned order workflow actions."""

    permission_classes = [IsAuthenticated, IsSupplierOrAdmin]
    target_status: str = ''
    audit_action: str = ''

    def post(self, request: Request, pk: str) -> Response:
        order = get_order_for_user(request.user, pk)
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = transition_order(
            request=request,
            order=order,
            new_status=self.target_status,
            reason=request.data.get('reason', ''),
            audit_action=self.audit_action,
        )
        return Response(payload, status=status.HTTP_200_OK)


class OrderAcceptView(SupplierOrderActionView):
    target_status = Order.Status.ACCEPTED
    audit_action = 'order.accepted'


class OrderRejectView(SupplierOrderActionView):
    audit_action = 'order.rejected'

    def post(self, request: Request, pk: str) -> Response:
        serializer = OrderRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = get_order_for_user(request.user, pk)
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = transition_order(
            request=request,
            order=order,
            new_status=Order.Status.REJECTED,
            reason=serializer.validated_data['reason'],
            audit_action=self.audit_action,
        )
        return Response(payload, status=status.HTTP_200_OK)


class OrderPrepareView(SupplierOrderActionView):
    target_status = Order.Status.PREPARING
    audit_action = 'order.preparing'


class OrderShipView(SupplierOrderActionView):
    target_status = Order.Status.SHIPPED
    audit_action = 'order.shipped'


class OrderDeliverView(SupplierOrderActionView):
    target_status = Order.Status.DELIVERED
    audit_action = 'order.delivered'


class OrderCompleteView(APIView):
    """Hospital confirms delivery and completes the order."""

    permission_classes = [IsAuthenticated, IsHospitalOrAdmin]

    def post(self, request: Request, pk: str) -> Response:
        order = get_order_for_user(request.user, pk)
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = transition_order(
            request=request,
            order=order,
            new_status=Order.Status.COMPLETED,
            reason=request.data.get('reason', ''),
            audit_action='order.completed',
        )
        return Response(payload, status=status.HTTP_200_OK)
