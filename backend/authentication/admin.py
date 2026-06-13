"""Django admin configuration for authentication."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from authentication.models import AuditLog, AuthToken, CustomUser, Organisation, UserSession


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    """Admin interface for Organisation records."""

    list_display = ('name', 'type', 'is_verified', 'registration_number', 'created_at')
    list_filter = ('type', 'is_verified', 'created_at')
    search_fields = ('name', 'registration_number', 'tmda_license')
    readonly_fields = ('id', 'created_at', 'verified_at')


@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    """Admin interface for CustomUser model."""

    ordering = ('email',)
    list_display = (
        'email',
        'full_name',
        'role',
        'organisation',
        'is_active',
        'is_verified',
        'is_staff',
        'created_at',
    )
    list_filter = ('role', 'is_active', 'is_verified', 'is_staff', 'created_at')
    search_fields = ('email', 'first_name', 'last_name', 'organisation__name')
    readonly_fields = ('id', 'created_at', 'updated_at', 'last_login', 'last_login_ip')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        (
            'Personal info',
            {'fields': ('first_name', 'last_name', 'organisation')},
        ),
        (
            'Permissions',
            {
                'fields': (
                    'role',
                    'is_active',
                    'is_verified',
                    'mfa_enabled',
                    'is_staff',
                    'is_superuser',
                    'groups',
                    'user_permissions',
                ),
            },
        ),
        (
            'Security',
            {'fields': ('last_login', 'last_login_ip', 'created_at', 'updated_at')},
        ),
    )

    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': (
                    'email',
                    'password1',
                    'password2',
                    'role',
                    'organisation',
                    'is_staff',
                    'is_active',
                ),
            },
        ),
    )

    def has_module_permission(self, request) -> bool:
        return request.user.is_staff

    def has_view_permission(self, request, obj=None) -> bool:
        return request.user.is_staff

    def has_change_permission(self, request, obj=None) -> bool:
        return request.user.is_staff

    def has_add_permission(self, request) -> bool:
        return request.user.is_staff

    def has_delete_permission(self, request, obj=None) -> bool:
        return request.user.is_superuser


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    """Admin interface for user session audit records."""

    list_display = ('user', 'ip_address', 'created_at', 'expires_at')
    list_filter = ('created_at', 'expires_at')
    search_fields = ('user__email', 'ip_address')
    readonly_fields = ('id', 'session_token', 'created_at')

    def has_module_permission(self, request) -> bool:
        return request.user.is_staff


@admin.register(AuthToken)
class AuthTokenAdmin(admin.ModelAdmin):
    """Admin interface for authentication tokens."""

    list_display = ('user', 'token_type', 'created_at', 'expires_at', 'used_at')
    list_filter = ('token_type', 'created_at', 'expires_at')
    search_fields = ('user__email',)
    readonly_fields = ('id', 'token', 'created_at')

    def has_module_permission(self, request) -> bool:
        return request.user.is_staff


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Admin interface for audit log entries."""

    list_display = ('action', 'user', 'ip_address', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('user__email', 'action', 'ip_address')
    readonly_fields = ('id', 'created_at')

    def has_module_permission(self, request) -> bool:
        return request.user.is_staff
