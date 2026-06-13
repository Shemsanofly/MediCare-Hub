"""Role-based dashboard summary API views."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.models import CustomUser
from authentication.permissions import IsAdminUser, IsHospitalOrAdmin, IsSupplierOrAdmin
from dashboard.services import get_admin_summary, get_hospital_summary, get_supplier_summary


class HospitalDashboardSummaryView(APIView):
    """Dashboard summary for hospital procurement users."""

    permission_classes = [IsAuthenticated, IsHospitalOrAdmin]

    def get(self, request: Request) -> Response:
        data = get_hospital_summary(request.user)
        return Response(data, status=status.HTTP_200_OK)


class SupplierDashboardSummaryView(APIView):
    """Dashboard summary for supplier users."""

    permission_classes = [IsAuthenticated, IsSupplierOrAdmin]

    def get(self, request: Request) -> Response:
        data = get_supplier_summary(request.user)
        return Response(data, status=status.HTTP_200_OK)


class AdminDashboardSummaryView(APIView):
    """Dashboard summary for platform administrators."""

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        data = get_admin_summary(request.user)
        return Response(data, status=status.HTTP_200_OK)
