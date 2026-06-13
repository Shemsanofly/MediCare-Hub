"""Marketplace API views with explicit RBAC permissions."""

import logging
from typing import Any

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from authentication.models import CustomUser
from authentication.permissions import (
    IsAdminUser,
    IsAnyOf,
    IsHospitalOrSupplierOrAdmin,
    IsVerifiedSupplier,
)
from authentication.services import create_audit_log
from marketplace.models import Supplier
from marketplace.pagination import ProductCursorPagination
from marketplace.models import Product
from marketplace.serializers import (
    ProductListSerializer,
    ProductWriteSerializer,
    SupplierPendingSerializer,
    SupplierRejectSerializer,
    SupplierSuspendSerializer,
)
from marketplace.services import build_product_search_queryset, get_pending_suppliers_queryset
from marketplace.signals import build_product_list_cache_key
from marketplace.tasks import schedule_supplier_verification_expiry_check, send_supplier_suspension_email

logger = logging.getLogger(__name__)

PRODUCT_LIST_CACHE_TIMEOUT = 300


class ProductViewSet(viewsets.ViewSet):
    """
    Product catalog search, detail, and supplier product management.

    GET /products/ uses cursor pagination with search and filters.
    """

    pagination_class = ProductCursorPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsHospitalOrSupplierOrAdmin()]
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [
                IsAuthenticated(),
                IsAnyOf(IsVerifiedSupplier, IsAdminUser),
            ]
        return [IsAuthenticated(), IsAdminUser()]

    def _extract_query_params(self, request: Request) -> dict[str, Any]:
        return {
            key: request.query_params.get(key)
            for key in (
                'search',
                'category',
                'supplier',
                'min_price',
                'max_price',
                'cold_chain_required',
                'in_stock',
                'valid_expiry',
                'sort',
                'cursor',
                'page_size',
            )
            if request.query_params.get(key) is not None
        }

    def list(self, request: Request) -> Response:
        params = self._extract_query_params(request)
        cache_key = build_product_list_cache_key(params)
        cached_response = cache.get(cache_key)
        if cached_response is not None:
            return Response(cached_response, status=status.HTTP_200_OK)

        queryset = build_product_search_queryset(params)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ProductListSerializer(
            page,
            many=True,
            context={'request': request},
        )
        response_data = paginator.get_paginated_response(serializer.data).data

        cache.set(cache_key, response_data, PRODUCT_LIST_CACHE_TIMEOUT)
        return Response(response_data, status=status.HTTP_200_OK)

    def _get_product_for_response(self, pk: str) -> Product:
        """Fetch a single active product without default expiry filtering."""
        return build_product_search_queryset({'valid_expiry': 'false'}).get(pk=pk)

    def retrieve(self, request: Request, pk: str = None) -> Response:
        try:
            product = self._get_product_for_response(pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    def _get_writable_product(self, request: Request, pk: str) -> Product | None:
        try:
            product = Product.objects.select_related(
                'supplier',
                'supplier__organisation',
                'category',
            ).get(pk=pk)
        except Product.DoesNotExist:
            return None

        user = request.user
        if user.role == CustomUser.Role.ADMIN:
            return product
        if (
            user.role == CustomUser.Role.SUPPLIER
            and str(product.supplier.organisation_id) == str(user.organisation_id)
        ):
            return product
        return None

    def create(self, request: Request) -> Response:
        serializer = ProductWriteSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        product = self._get_product_for_response(str(product.pk))
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, pk: str = None) -> Response:
        product = self._get_writable_product(request, pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductWriteSerializer(
            product,
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        product = self._get_product_for_response(str(product.pk))
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    def partial_update(self, request: Request, pk: str = None) -> Response:
        product = self._get_writable_product(request, pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductWriteSerializer(
            product,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        product = self._get_product_for_response(str(product.pk))
        return Response(
            ProductListSerializer(product, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request: Request, pk: str = None) -> Response:
        product = self._get_writable_product(request, pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupplierVerificationViewSet(viewsets.ViewSet):
    """Admin-only supplier verification workflow."""

    permission_classes = [IsAuthenticated, IsAdminUser]

    @action(detail=False, methods=['get'], url_path='pending')
    def pending(self, request: Request) -> Response:
        suppliers = get_pending_suppliers_queryset()
        serializer = SupplierPendingSerializer(suppliers, many=True)
        return Response({'results': serializer.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request: Request, pk: str = None) -> Response:
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
                    metadata={
                        'supplier_id': str(supplier.pk),
                        'organisation_id': str(supplier.organisation_id),
                    },
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

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request: Request, pk: str = None) -> Response:
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

    @action(detail=True, methods=['post'], url_path='suspend')
    def suspend(self, request: Request, pk: str = None) -> Response:
        serializer = SupplierSuspendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                supplier = (
                    Supplier.objects.select_for_update()
                    .select_related('organisation')
                    .get(pk=pk)
                )
                supplier.verification_status = Supplier.VerificationStatus.SUSPENDED
                supplier.suspension_reason = serializer.validated_data['reason']
                supplier.verified_by = request.user
                supplier.verified_at = timezone.now()
                supplier.save(
                    update_fields=[
                        'verification_status',
                        'suspension_reason',
                        'verified_by',
                        'verified_at',
                        'updated_at',
                    ]
                )

                supplier.organisation.is_verified = False
                supplier.organisation.save(update_fields=['is_verified'])

                create_audit_log(
                    action='supplier.suspended',
                    request=request,
                    user=request.user,
                    metadata={
                        'supplier_id': str(supplier.pk),
                        'reason': supplier.suspension_reason,
                    },
                )
        except Supplier.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        send_supplier_suspension_email.delay(
            str(supplier.pk),
            serializer.validated_data['reason'],
        )

        return Response(
            SupplierPendingSerializer(supplier).data,
            status=status.HTTP_200_OK,
        )
