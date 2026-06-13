"""Dashboard URL configuration."""

from django.urls import path

from dashboard.views import (
    AdminDashboardSummaryView,
    HospitalDashboardSummaryView,
    SupplierDashboardSummaryView,
)

app_name = 'dashboard'

urlpatterns = [
    path(
        'hospital/summary/',
        HospitalDashboardSummaryView.as_view(),
        name='hospital-summary',
    ),
    path(
        'supplier/summary/',
        SupplierDashboardSummaryView.as_view(),
        name='supplier-summary',
    ),
    path(
        'admin/summary/',
        AdminDashboardSummaryView.as_view(),
        name='admin-summary',
    ),
]
