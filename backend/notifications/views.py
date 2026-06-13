"""Notifications API views with explicit RBAC permissions."""

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from authentication.permissions import IsAdminUser, IsOrganisationMember


class NotificationViewSet(viewsets.ViewSet):
    """In-app notifications for authenticated organisation members."""

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'partial_update'):
            return [IsAuthenticated(), IsOrganisationMember()]
        return [IsAuthenticated(), IsAdminUser()]

    def list(self, request: Request) -> Response:
        return Response({'results': []}, status=status.HTTP_200_OK)

    def retrieve(self, request: Request, pk: str = None) -> Response:
        return Response({'id': pk}, status=status.HTTP_200_OK)

    def partial_update(self, request: Request, pk: str = None) -> Response:
        return Response({'id': pk, **request.data}, status=status.HTTP_200_OK)
