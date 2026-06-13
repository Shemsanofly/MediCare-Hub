"""Admin portal URL configuration."""

from django.urls import path

from admin_portal.views import (
    AdminOrderDetailView,
    AdminOrderListView,
    AdminProductDetailView,
    AdminProductListView,
    AdminSupplierDetailView,
    AdminSupplierListView,
    AdminSupplierRejectView,
    AdminSupplierVerifyView,
    AdminUserDetailView,
    AdminUserListView,
)

app_name = 'admin_portal'

urlpatterns = [
    path('users/', AdminUserListView.as_view(), name='user-list'),
    path('users/<uuid:pk>/', AdminUserDetailView.as_view(), name='user-detail'),
    path('suppliers/', AdminSupplierListView.as_view(), name='supplier-list'),
    path('suppliers/<uuid:pk>/', AdminSupplierDetailView.as_view(), name='supplier-detail'),
    path(
        'suppliers/<uuid:pk>/verify/',
        AdminSupplierVerifyView.as_view(),
        name='supplier-verify',
    ),
    path(
        'suppliers/<uuid:pk>/reject/',
        AdminSupplierRejectView.as_view(),
        name='supplier-reject',
    ),
    path('products/', AdminProductListView.as_view(), name='product-list'),
    path('products/<uuid:pk>/', AdminProductDetailView.as_view(), name='product-detail'),
    path('orders/', AdminOrderListView.as_view(), name='order-list'),
    path('orders/<uuid:pk>/', AdminOrderDetailView.as_view(), name='order-detail'),
]
