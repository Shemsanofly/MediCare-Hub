"""Admin management API views."""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import CustomUser
from authentication.permissions import IsAdminUser
from authentication.serializers import UserProfileSerializer
from authentication.services import create_audit_log
from marketplace.models import Product, Supplier
from marketplace.serializers import (
    ProductListSerializer,
    SupplierPendingSerializer,
    SupplierRejectSerializer,
)
from marketplace.tasks import schedule_supplier_verification_expiry_check
from orders.models import Order

from admin_portal.services import (
    filter_orders,
    filter_products,
    filter_suppliers,
    filter_users,
    serialize_order_for_admin,
)


class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        users = filter_users(
            search=request.query_params.get('search', ''),
            role=request.query_params.get('role', ''),
            is_active=request.query_params.get('is_active'),
        )
        serializer = UserProfileSerializer(users[:100], many=True)
        create_audit_log(
            action='admin.users_listed',
            request=request,
            user=request.user,
            metadata={'count': users.count()},
        )
        return Response({'results': serializer.data}, status=status.HTTP_200_OK)


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request, pk: str) -> Response:
        try:
            user = CustomUser.objects.select_related('organisation').get(pk=pk)
        except CustomUser.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, pk: str) -> Response:
        try:
            user = CustomUser.objects.select_related('organisation').get(pk=pk)
        except CustomUser.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.role == CustomUser.Role.ADMIN and str(user.pk) == str(request.user.pk):
            if request.data.get('is_active') is False:
                return Response(
                    {'detail': 'Cannot deactivate your own admin account.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if 'is_active' in request.data:
            user.is_active = bool(request.data['is_active'])
            user.save(update_fields=['is_active', 'updated_at'])
            create_audit_log(
                action='admin.user_status_changed',
                request=request,
                user=request.user,
                metadata={'target_user_id': str(user.pk), 'is_active': user.is_active},
            )

        return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)


class AdminSupplierListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        suppliers = filter_suppliers(
            search=request.query_params.get('search', ''),
            status=request.query_params.get('status', ''),
        )
        serializer = SupplierPendingSerializer(suppliers[:100], many=True)
        return Response({'results': serializer.data}, status=status.HTTP_200_OK)


class AdminSupplierDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request, pk: str) -> Response:
        try:
            supplier = (
                Supplier.objects.select_related('organisation', 'verified_by')
                .prefetch_related('documents')
                .get(pk=pk)
            )
        except Supplier.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            SupplierPendingSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )


class AdminSupplierVerifyView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request: Request, pk: str) -> Response:
        return self._verify(request, pk)

    def patch(self, request: Request, pk: str) -> Response:
        return self._verify(request, pk)

    def _verify(self, request: Request, pk: str) -> Response:
        try:
            with transaction.atomic():
                supplier = (
                    Supplier.objects.select_for_update()
                    .select_related('organisation')
                    .get(pk=pk)
                )
                if supplier.verification_status == Supplier.VerificationStatus.VERIFIED:
                    return Response(
                        {'detail': 'Supplier is already verified.'},
                        status=status.HTTP_409_CONFLICT,
                    )
                if supplier.verification_status != Supplier.VerificationStatus.PENDING:
                    return Response(
                        {'detail': 'Only pending suppliers can be verified.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                supplier.verification_status = Supplier.VerificationStatus.VERIFIED
                supplier.verified_by = request.user
                supplier.verified_at = timezone.now()
                supplier.rejection_reason = ''
                supplier.suspension_reason = ''
                supplier.save(
                    update_fields=[
                        'verification_status',
                        'verified_by',
                        'verified_at',
                        'rejection_reason',
                        'suspension_reason',
                        'updated_at',
                    ]
                )
                supplier.organisation.is_verified = True
                supplier.organisation.verified_at = supplier.verified_at
                supplier.organisation.save(
                    update_fields=['is_verified', 'verified_at'],
                )
                create_audit_log(
                    action='supplier.verified',
                    request=request,
                    user=request.user,
                    metadata={'supplier_id': str(supplier.pk)},
                )
        except Supplier.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        schedule_supplier_verification_expiry_check.apply_async(
            args=[str(supplier.pk)],
            countdown=90 * 24 * 60 * 60,
        )
        supplier = (
            Supplier.objects.select_related('organisation', 'verified_by')
            .prefetch_related('documents')
            .get(pk=supplier.pk)
        )
        return Response(
            SupplierPendingSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )


class AdminSupplierRejectView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request: Request, pk: str) -> Response:
        return self._reject(request, pk)

    def patch(self, request: Request, pk: str) -> Response:
        return self._reject(request, pk)

    def _reject(self, request: Request, pk: str) -> Response:
        serializer = SupplierRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                supplier = Supplier.objects.select_for_update().get(pk=pk)
                if supplier.verification_status != Supplier.VerificationStatus.PENDING:
                    return Response(
                        {'detail': 'Only pending suppliers can be rejected.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                supplier.verification_status = Supplier.VerificationStatus.REJECTED
                supplier.rejection_reason = serializer.validated_data['reason']
                supplier.verified_by = request.user
                supplier.verified_at = timezone.now()
                supplier.save(
                    update_fields=[
                        'verification_status',
                        'rejection_reason',
                        'verified_by',
                        'verified_at',
                        'updated_at',
                    ]
                )
                create_audit_log(
                    action='supplier.rejected',
                    request=request,
                    user=request.user,
                    metadata={
                        'supplier_id': str(supplier.pk),
                        'reason': supplier.rejection_reason,
                    },
                )
        except Supplier.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            SupplierPendingSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )


class AdminProductListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        products = filter_products(
            search=request.query_params.get('search', ''),
            category=request.query_params.get('category', ''),
            supplier=request.query_params.get('supplier', ''),
            stock_status=request.query_params.get('stock_status', ''),
            is_active=request.query_params.get('is_active'),
        )
        serializer = ProductListSerializer(
            products,
            many=True,
            context={'request': request},
        )
        return Response({'results': serializer.data}, status=status.HTTP_200_OK)


class AdminProductDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request, pk: str) -> Response:
        try:
            product = (
                Product.objects.select_related(
                    'supplier',
                    'supplier__organisation',
                    'category',
                )
                .prefetch_related('batches')
                .get(pk=pk)
            )
        except Product.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, pk: str) -> Response:
        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'is_active' in request.data:
            product.is_active = bool(request.data['is_active'])
            product.save(update_fields=['is_active', 'updated_at'])
            create_audit_log(
                action='admin.product_status_changed',
                request=request,
                user=request.user,
                metadata={'product_id': str(product.pk), 'is_active': product.is_active},
            )

        product = (
            Product.objects.select_related(
                'supplier',
                'supplier__organisation',
                'category',
            )
            .prefetch_related('batches')
            .get(pk=pk)
        )
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, pk: str) -> Response:
        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        create_audit_log(
            action='admin.product_deleted',
            request=request,
            user=request.user,
            metadata={'product_id': str(pk)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminOrderListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        orders = filter_orders(
            status=request.query_params.get('status', ''),
            search=request.query_params.get('search', ''),
        )
        results = [serialize_order_for_admin(order) for order in orders]
        return Response({'results': results}, status=status.HTTP_200_OK)


class AdminOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request, pk: str) -> Response:
        try:
            order = (
                Order.objects.select_related(
                    'buyer',
                    'organisation',
                    'supplier',
                    'supplier__organisation',
                )
                .prefetch_related('items__product', 'payments')
                .get(pk=pk)
            )
        except Order.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_order_for_admin(order), status=status.HTTP_200_OK)
