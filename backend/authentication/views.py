"""Authentication API views for MediCare Hub."""

import logging

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from authentication.errors import (
    EmailAlreadyVerifiedError,
    InvalidTokenError,
    TokenExpiredError,
)
from authentication.models import AuthToken, CustomUser
from authentication.permissions import IsAdminUser
from authentication.serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    RegistrationSerializer,
    UserProfileSerializer,
)
from authentication.services import (
    EMAIL_VERIFICATION_LIFETIME,
    PASSWORD_RESET_LIFETIME,
    blacklist_refresh_token,
    create_audit_log,
    create_auth_token,
    get_valid_auth_token,
    invalidate_all_user_sessions,
)
from authentication.tasks import send_password_reset_email, send_verification_email
from authentication.throttles import LoginIPThrottle, PasswordResetEmailThrottle
from authentication.utils import (
    clear_refresh_token_cookie,
    get_refresh_token_from_request,
    set_refresh_token_cookie,
)

logger = logging.getLogger(__name__)


class RegistrationViewSet(viewsets.GenericViewSet):
    """ViewSet for hospital and supplier self-service registration."""

    serializer_class = RegistrationSerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def create(self, request: Request) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        auth_token = create_auth_token(
            user=user,
            token_type=AuthToken.Type.EMAIL_VERIFICATION,
            lifetime=EMAIL_VERIFICATION_LIFETIME,
        )
        send_verification_email.delay(str(user.pk), auth_token.token)

        create_audit_log(
            action='user.registered',
            request=request,
            user=user,
            metadata={'role': user.role},
        )

        return Response(
            UserProfileSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginIPThrottle])
def login_view(request: Request) -> Response:
    """Authenticate with email and password; return access token and set refresh cookie."""
    serializer = LoginSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    user = data['user']

    create_audit_log(
        action='user.login',
        request=request,
        user=user,
        metadata={
            'ip_address': data['ip_address'],
            'device_info': data['device_info'],
        },
    )

    response = Response(
        {
            'access': data['access'],
            'user': UserProfileSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )
    set_refresh_token_cookie(response, data['refresh'])
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh_view(request: Request) -> Response:
    """Refresh the access token using the HttpOnly refresh cookie with rotation."""
    refresh_token = get_refresh_token_from_request(request)
    if not refresh_token:
        raise InvalidTokenError(
            'Refresh token not found.',
            code='REFRESH_TOKEN_MISSING',
        )

    serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
    try:
        serializer.is_valid(raise_exception=True)
    except DRFValidationError:
        raise InvalidTokenError(
            'Invalid or expired refresh token.',
            code='INVALID_REFRESH_TOKEN',
        )

    new_refresh = serializer.validated_data['refresh']
    new_access = serializer.validated_data['access']

    create_audit_log(
        action='token.refreshed',
        request=request,
        metadata={'rotated': True},
    )

    response = Response({'access': new_access}, status=status.HTTP_200_OK)
    set_refresh_token_cookie(response, new_refresh)
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_view(request: Request, token: str) -> Response:
    """Verify a user's email address using a time-limited token."""
    auth_token = get_valid_auth_token(token, AuthToken.Type.EMAIL_VERIFICATION)
    if auth_token is None:
        try:
            expired_token = AuthToken.objects.select_related('user').get(
                token=token,
                token_type=AuthToken.Type.EMAIL_VERIFICATION,
            )
            if expired_token.used_at is not None:
                raise InvalidTokenError(
                    'This verification link has already been used.',
                    code='TOKEN_ALREADY_USED',
                )
            raise TokenExpiredError(
                'This verification link has expired.',
                code='TOKEN_EXPIRED',
            )
        except AuthToken.DoesNotExist:
            raise InvalidTokenError(
                'Invalid verification token.',
                code='INVALID_TOKEN',
            )

    user = auth_token.user
    if user.is_verified:
        raise EmailAlreadyVerifiedError('Email address is already verified.')

    user.is_verified = True
    user.save(update_fields=['is_verified', 'updated_at'])

    auth_token.used_at = timezone.now()
    auth_token.save(update_fields=['used_at'])

    create_audit_log(
        action='email.verified',
        request=request,
        user=user,
        metadata={'token_id': str(auth_token.id)},
    )

    return Response(
        {'message': 'Email verified successfully.'},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetEmailThrottle])
def password_reset_view(request: Request) -> Response:
    """Send a password reset email with a 1-hour token."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data['email'].lower()
    user = CustomUser.objects.filter(email__iexact=email, is_active=True).first()

    if user is not None:
        auth_token = create_auth_token(
            user=user,
            token_type=AuthToken.Type.PASSWORD_RESET,
            lifetime=PASSWORD_RESET_LIFETIME,
        )
        send_password_reset_email.delay(str(user.pk), auth_token.token)

    create_audit_log(
        action='password.reset_requested',
        request=request,
        user=user,
        metadata={'email': email},
    )

    return Response(
        {
            'message': (
                'If an account exists with this email, '
                'a password reset link has been sent.'
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm_view(request: Request) -> Response:
    """Set a new password and invalidate all existing sessions."""
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    token = serializer.validated_data['token']
    password = serializer.validated_data['password']

    auth_token = get_valid_auth_token(token, AuthToken.Type.PASSWORD_RESET)
    if auth_token is None:
        try:
            expired_token = AuthToken.objects.get(
                token=token,
                token_type=AuthToken.Type.PASSWORD_RESET,
            )
            if expired_token.used_at is not None:
                raise InvalidTokenError(
                    'This reset link has already been used.',
                    code='TOKEN_ALREADY_USED',
                )
            raise TokenExpiredError(
                'This reset link has expired.',
                code='TOKEN_EXPIRED',
            )
        except AuthToken.DoesNotExist:
            raise InvalidTokenError(
                'Invalid password reset token.',
                code='INVALID_TOKEN',
            )

    user = auth_token.user
    user.set_password(password)
    user.save(update_fields=['password', 'updated_at'])

    auth_token.used_at = timezone.now()
    auth_token.save(update_fields=['used_at'])

    sessions_invalidated = invalidate_all_user_sessions(user)

    create_audit_log(
        action='password.reset_confirmed',
        request=request,
        user=user,
        metadata={
            'token_id': str(auth_token.id),
            'sessions_invalidated': sessions_invalidated,
        },
    )

    return Response(
        {'message': 'Password has been reset successfully.'},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    """Blacklist the refresh token and clear the HttpOnly cookie."""
    refresh_token = get_refresh_token_from_request(request)
    if refresh_token:
        blacklist_refresh_token(refresh_token)

    create_audit_log(
        action='user.logout',
        request=request,
        user=request.user if request.user.is_authenticated else None,
    )

    response = Response(status=status.HTTP_204_NO_CONTENT)
    clear_refresh_token_cookie(response)
    return response


class CurrentUserView(APIView):
    """Return or update the authenticated user's profile."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = CustomUser.objects.select_related('organisation').get(pk=request.user.pk)
        serializer = UserProfileSerializer(user)
        create_audit_log(
            action='profile.retrieved',
            request=request,
            user=user,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request: Request) -> Response:
        user = CustomUser.objects.select_related('organisation').get(pk=request.user.pk)
        serializer = ProfileUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        create_audit_log(
            action='profile.updated',
            request=request,
            user=user,
        )
        return Response(
            UserProfileSerializer(user).data,
            status=status.HTTP_200_OK,
        )


class AdminUserListView(APIView):
    """Admin-only endpoint to list platform users."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request: Request) -> Response:
        users = CustomUser.objects.select_related('organisation').all()
        serializer = UserProfileSerializer(users, many=True)
        create_audit_log(
            action='admin.users_listed',
            request=request,
            user=request.user,
            metadata={'count': users.count()},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)
