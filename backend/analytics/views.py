"""Analytics API views with explicit RBAC permissions."""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from authentication.permissions import IsAdminUser, IsSupplierOrAdmin


class AnalyticsViewSet(viewsets.ViewSet):
    """Platform and supplier analytics dashboards."""

    def get_permissions(self):
        if self.action == 'platform':
            return [IsAuthenticated(), IsAdminUser()]
        if self.action in ('list', 'retrieve', 'supplier'):
            return [IsAuthenticated(), IsSupplierOrAdmin()]
        return [IsAuthenticated(), IsAdminUser()]

    def list(self, request: Request) -> Response:
        return Response({'results': []}, status=status.HTTP_200_OK)

    def retrieve(self, request: Request, pk: str = None) -> Response:
        return Response({'id': pk}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def platform(self, request: Request) -> Response:
        return Response({'metrics': {}}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def supplier(self, request: Request) -> Response:
        return Response({'metrics': {}}, status=status.HTTP_200_OK)
