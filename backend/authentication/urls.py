"""Authentication URL configuration."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from authentication.views import (
    AdminUserListView,
    CurrentUserView,
    RegistrationViewSet,
    login_view,
    logout_view,
    password_reset_confirm_view,
    password_reset_view,
    token_refresh_view,
    verify_email_view,
)

app_name = 'authentication'

router = DefaultRouter()
router.register('register', RegistrationViewSet, basename='register')

urlpatterns = [
    path('login/', login_view, name='login'),
    path('token/refresh/', token_refresh_view, name='token_refresh'),
    path('verify-email/<str:token>/', verify_email_view, name='verify_email'),
    path('password-reset/', password_reset_view, name='password_reset'),
    path(
        'password-reset/confirm/',
        password_reset_confirm_view,
        name='password_reset_confirm',
    ),
    path('logout/', logout_view, name='logout'),
    path('me/', CurrentUserView.as_view(), name='current_user'),
    path('users/', AdminUserListView.as_view(), name='admin_user_list'),
    *router.urls,
]
