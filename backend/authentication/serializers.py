"""Authentication serializers for MediCare Hub."""

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.settings import api_settings

from authentication.errors import (
    AccountDeactivatedError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    ValidationFailedError,
)
from authentication.models import CustomUser, Organisation, UserSession
from authentication.utils import (
    get_client_ip,
    get_device_info,
    validate_password_strength,
)

REGISTRATION_ROLES = (
    CustomUser.Role.HOSPITAL,
    CustomUser.Role.SUPPLIER,
)


class OrganisationSerializer(serializers.ModelSerializer):
    """Read-only organisation profile for nested user responses."""

    class Meta:
        model = Organisation
        fields = (
            'id',
            'name',
            'type',
            'registration_number',
            'tmda_license',
            'is_verified',
            'verified_at',
            'created_at',
        )
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only serializer for user profile responses."""

    full_name = serializers.CharField(read_only=True)
    organisation = OrganisationSerializer(read_only=True)

    class Meta:
        model = CustomUser
        fields = (
            'id',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'role',
            'organisation',
            'is_active',
            'is_verified',
            'mfa_enabled',
            'last_login_ip',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields


class RegistrationSerializer(serializers.Serializer):
    """Serializer for self-service user registration."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=REGISTRATION_ROLES)
    organisation_name = serializers.CharField(max_length=255)
    organisation_type = serializers.ChoiceField(choices=Organisation.Type.choices)
    registration_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    tmda_license = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        if CustomUser.objects.filter(email__iexact=value).exists():
            raise EmailAlreadyExistsError('A user with this email already exists.')
        return value.lower()

    def validate_password(self, value: str) -> str:
        return validate_password_strength(value)

    def validate_role(self, value: str) -> str:
        if value not in REGISTRATION_ROLES:
            raise ValidationFailedError(
                'Role must be HOSPITAL or SUPPLIER.',
                code='INVALID_ROLE',
            )
        return value

    def create(self, validated_data: dict) -> CustomUser:
        org_name = validated_data.pop('organisation_name')
        org_type = validated_data.pop('organisation_type')
        registration_number = validated_data.pop('registration_number', '')
        tmda_license = validated_data.pop('tmda_license', '')

        user = CustomUser(
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            role=validated_data['role'],
        )
        user._pending_organisation_data = {
            'name': org_name,
            'type': org_type,
            'registration_number': registration_number,
            'tmda_license': tmda_license,
        }
        user.set_password(validated_data['password'])
        user.save()
        user.refresh_from_db()
        return user


class LoginSerializer(serializers.Serializer):
    """Login serializer using email credentials and session tracking."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs: dict) -> dict:
        email = attrs.get('email', '').lower()
        password = attrs.get('password')

        user = authenticate(
            request=self.context.get('request'),
            username=email,
            password=password,
        )
        if user is None:
            raise InvalidCredentialsError('Invalid email or password.')

        if not user.is_active:
            raise AccountDeactivatedError('This account has been deactivated.')

        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(user)
        request = self.context.get('request')

        ip_address = None
        device_info: dict = {}
        if request is not None:
            ip_address = get_client_ip(request)
            device_info = get_device_info(request)
            user.last_login_ip = ip_address
            user.save(update_fields=['last_login_ip', 'updated_at'])

            lifetime = api_settings.REFRESH_TOKEN_LIFETIME
            UserSession.objects.create(
                user=user,
                session_token=str(refresh),
                ip_address=ip_address,
                device_info=device_info,
                expires_at=timezone.now() + lifetime,
            )

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': user,
            'ip_address': ip_address,
            'device_info': device_info,
        }


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating the authenticated user's profile."""

    class Meta:
        model = CustomUser
        fields = ('first_name', 'last_name', 'mfa_enabled')
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'mfa_enabled': {'required': False},
        }

    def update(self, instance: CustomUser, validated_data: dict) -> CustomUser:
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for initiating a password reset."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for confirming a password reset."""

    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_password(self, value: str) -> str:
        return validate_password_strength(value)
