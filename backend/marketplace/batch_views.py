"""Product batch inventory API views."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import CustomUser
from authentication.permissions import IsAdminUser, IsAnyOf, IsHospitalOrSupplierOrAdmin, IsVerifiedSupplier
from authentication.services import create_audit_log
from marketplace.models import Product, ProductBatch
from marketplace.serializers import (
    ProductBatchPublicSerializer,
    ProductBatchSupplierSerializer,
    ProductBatchWriteSerializer,
)


def _get_product_for_batch_access(request: Request, product_id: str) -> Product | None:
    try:
        product = Product.objects.select_related(
            'supplier',
            'supplier__organisation',
        ).get(pk=product_id)
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
    if user.role == CustomUser.Role.HOSPITAL:
        return product if product.is_active else None
    return None


def _get_batch_for_access(request: Request, batch_id: str) -> ProductBatch | None:
    try:
        batch = ProductBatch.objects.select_related(
            'product',
            'product__supplier',
            'product__supplier__organisation',
            'supplier',
        ).get(pk=batch_id)
    except ProductBatch.DoesNotExist:
        return None

    user = request.user
    if user.role == CustomUser.Role.ADMIN:
        return batch
    if (
        user.role == CustomUser.Role.SUPPLIER
        and str(batch.product.supplier.organisation_id) == str(user.organisation_id)
    ):
        return batch
    if user.role == CustomUser.Role.HOSPITAL:
        return batch if batch.product.is_active else None
    return None


def _serialize_batches(request: Request, batches) -> list[dict]:
    if request.user.role in (CustomUser.Role.SUPPLIER, CustomUser.Role.ADMIN):
        return ProductBatchSupplierSerializer(batches, many=True).data
    return ProductBatchPublicSerializer(batches, many=True).data


class ProductBatchListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalOrSupplierOrAdmin]

    def get(self, request: Request, product_id: str) -> Response:
        product = _get_product_for_batch_access(request, product_id)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        batches = product.batches.order_by('expiry_date')
        return Response(
            {'results': _serialize_batches(request, batches)},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, product_id: str) -> Response:
        product = _get_product_for_batch_access(request, product_id)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == CustomUser.Role.HOSPITAL:
            return Response(
                {'detail': 'Hospitals cannot create inventory batches.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            request.user.role == CustomUser.Role.SUPPLIER
            and str(product.supplier.organisation_id) != str(request.user.organisation_id)
        ):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductBatchWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        batch = ProductBatch.objects.create(
            product=product,
            supplier=product.supplier,
            **serializer.validated_data,
        )
        create_audit_log(
            action='batch.created',
            request=request,
            user=request.user,
            metadata={'batch_id': str(batch.id), 'product_id': str(product.id)},
        )
        return Response(
            ProductBatchSupplierSerializer(batch).data,
            status=status.HTTP_201_CREATED,
        )


class ProductBatchDetailView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsHospitalOrSupplierOrAdmin()]
        return [
            IsAuthenticated(),
            IsAnyOf(IsVerifiedSupplier, IsAdminUser),
        ]

    def get(self, request: Request, pk: str) -> Response:
        batch = _get_batch_for_access(request, pk)
        if batch is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role in (CustomUser.Role.SUPPLIER, CustomUser.Role.ADMIN):
            data = ProductBatchSupplierSerializer(batch).data
        else:
            data = ProductBatchPublicSerializer(batch).data
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request: Request, pk: str) -> Response:
        batch = _get_batch_for_access(request, pk)
        if batch is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if (
            request.user.role == CustomUser.Role.SUPPLIER
            and str(batch.product.supplier.organisation_id) != str(request.user.organisation_id)
        ):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        reserved = batch.reserved_quantity
        serializer = ProductBatchWriteSerializer(batch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        new_quantity = serializer.validated_data.get('quantity', batch.quantity)
        if new_quantity < reserved:
            return Response(
                {
                    'detail': (
                        f'Quantity cannot be less than reserved amount ({reserved}).'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch = serializer.save()
        create_audit_log(
            action='batch.updated',
            request=request,
            user=request.user,
            metadata={'batch_id': str(batch.id)},
        )
        return Response(ProductBatchSupplierSerializer(batch).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, pk: str) -> Response:
        batch = _get_batch_for_access(request, pk)
        if batch is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if (
            request.user.role == CustomUser.Role.SUPPLIER
            and str(batch.product.supplier.organisation_id) != str(request.user.organisation_id)
        ):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if batch.reserved_quantity > 0:
            return Response(
                {'detail': 'Cannot delete a batch with active reservations.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch_id = str(batch.id)
        batch.delete()
        create_audit_log(
            action='batch.deleted',
            request=request,
            user=request.user,
            metadata={'batch_id': batch_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
