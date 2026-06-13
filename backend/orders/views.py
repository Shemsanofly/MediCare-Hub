"""Orders API views with explicit RBAC permissions."""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import CustomUser
from authentication.permissions import (
    HasProcurementApprovalPermission,
    IsAdminUser,
    IsHospitalOrAdmin,
    IsHospitalOrSupplierOrAdmin,
    IsOrganisationMember,
    IsSupplierOrAdmin,
)
from orders.errors import CartError, CheckoutError, OrderTransitionError
from orders.models import Order
from orders.serializers import (
    CartAddItemSerializer,
    CartRemoveItemSerializer,
    CheckoutSerializer,
    OrderTransitionSerializer,
)
from orders.services import CartService, CheckoutService
from orders.state_machine import OrderStateManager


class CartView(APIView):
    """Redis-backed cart operations for hospital users."""

    permission_classes = [IsAuthenticated, IsHospitalOrAdmin, IsOrganisationMember]

    def get(self, request: Request) -> Response:
        cart = CartService.get_cart(str(request.user.id))
        return Response(cart, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        serializer = CartAddItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            cart = CartService.add_item(
                str(request.user.id),
                str(data['product_id']),
                str(data['batch_id']) if data.get('batch_id') else None,
                data['quantity'],
            )
        except CartError as exc:
            raise exc

        return Response(cart, status=status.HTTP_200_OK)

    def delete(self, request: Request) -> Response:
        serializer = CartRemoveItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cart = CartService.remove_item(
                str(request.user.id),
                str(serializer.validated_data['product_id']),
            )
        except CartError as exc:
            raise exc

        return Response(cart, status=status.HTTP_200_OK)


class CheckoutView(APIView):
    """Convert Redis cart to a persisted order atomically."""

    permission_classes = [IsAuthenticated, IsHospitalOrAdmin, IsOrganisationMember]

    def post(self, request: Request) -> Response:
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = CheckoutService.checkout(
                request.user,
                notes=data.get('notes', ''),
                payment_terms=data.get('payment_terms', Order.PaymentTerms.IMMEDIATE),
                delivery_fee=data.get('delivery_fee'),
                tax_amount=data.get('tax_amount'),
                lpo_number=data.get('lpo_number', ''),
            )
        except CheckoutError as exc:
            raise exc

        return Response(result, status=status.HTTP_201_CREATED)


class OrderViewSet(viewsets.ViewSet):
    """
    Procurement order lifecycle.

    Hospitals place and view orders; suppliers process orders for their products.
    """

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [
                IsAuthenticated(),
                IsHospitalOrSupplierOrAdmin(),
                IsOrganisationMember(),
            ]
        if self.action == 'create':
            return [IsAuthenticated(), IsHospitalOrAdmin(), IsOrganisationMember()]
        if self.action == 'approve':
            return [
                IsAuthenticated(),
                HasProcurementApprovalPermission(),
                IsOrganisationMember(),
            ]
        if self.action in ('update', 'partial_update', 'process', 'transition'):
            return [IsAuthenticated(), IsSupplierOrAdmin(), IsOrganisationMember()]
        if self.action == 'destroy':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated(), IsAdminUser()]

    def _get_user_orders_queryset(self, user: CustomUser):
        queryset = Order.objects.select_related(
            'buyer',
            'organisation',
            'supplier',
            'supplier__organisation',
        ).prefetch_related('items__product', 'approval_steps')

        if user.role == CustomUser.Role.ADMIN:
            return queryset

        if user.role == CustomUser.Role.HOSPITAL:
            return queryset.filter(organisation_id=user.organisation_id)

        if user.role == CustomUser.Role.SUPPLIER:
            return queryset.filter(supplier__organisation_id=user.organisation_id)

        return queryset.none()

    def list(self, request: Request) -> Response:
        orders = self._get_user_orders_queryset(request.user)
        results = [
            CheckoutService._serialize_order(order)
            for order in orders[:20]
        ]
        return Response({'results': results}, status=status.HTTP_200_OK)

    def retrieve(self, request: Request, pk: str = None) -> Response:
        order = self._get_user_orders_queryset(request.user).filter(pk=pk).first()
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            CheckoutService._serialize_order(order),
            status=status.HTTP_200_OK,
        )

    def create(self, request: Request) -> Response:
        return Response(
            {
                'error': 'Use POST /api/v1/orders/checkout/ to place orders from cart.',
                'code': 'USE_CHECKOUT_ENDPOINT',
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request: Request, pk: str = None) -> Response:
        order = self._get_user_orders_queryset(request.user).filter(pk=pk).first()
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            order = CheckoutService.approve_next_step(order, request.user)
        except OrderTransitionError as exc:
            raise exc

        return Response(
            CheckoutService._serialize_order(order),
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'])
    def process(self, request: Request, pk: str = None) -> Response:
        order = self._get_user_orders_queryset(request.user).filter(pk=pk).first()
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            order = OrderStateManager.transition(
                order,
                Order.Status.PROCESSING,
                request.user,
                reason=request.data.get('reason', ''),
            )
        except OrderTransitionError as exc:
            raise exc

        return Response(
            CheckoutService._serialize_order(order),
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='transition')
    def transition(self, request: Request, pk: str = None) -> Response:
        order = self._get_user_orders_queryset(request.user).filter(pk=pk).first()
        if order is None:
            return Response(
                {'error': 'Order not found.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = OrderTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            order = OrderStateManager.transition(
                order,
                serializer.validated_data['status'],
                request.user,
                reason=serializer.validated_data.get('reason', ''),
            )
        except OrderTransitionError as exc:
            raise exc

        return Response(
            CheckoutService._serialize_order(order),
            status=status.HTTP_200_OK,
        )
