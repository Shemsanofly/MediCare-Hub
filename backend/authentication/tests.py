"""Tests for the authentication app."""

from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import AuditLog, AuthToken, CustomUser, Organisation, UserSession

VALID_PASSWORD = 'LocalTestPass1!'


class CustomUserModelTests(TestCase):
    """Test cases for the CustomUser model."""

    def test_create_user_with_email(self) -> None:
        org = Organisation.objects.create(
            name='City Hospital',
            type=Organisation.Type.HOSPITAL,
        )
        user = CustomUser.objects.create_user(
            email='hospital@example.com',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=org,
        )
        self.assertEqual(user.email, 'hospital@example.com')
        self.assertTrue(user.check_password(VALID_PASSWORD))
        self.assertFalse(user.is_staff)

    def test_create_superuser(self) -> None:
        admin = CustomUser.objects.create_superuser(
            email='admin@example.com',
            password=VALID_PASSWORD,
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.role, CustomUser.Role.ADMIN)

    def test_email_is_username_field(self) -> None:
        self.assertEqual(CustomUser.USERNAME_FIELD, 'email')

    def test_to_dict_excludes_password(self) -> None:
        user = CustomUser.objects.create_user(
            email='test@example.com',
            password=VALID_PASSWORD,
        )
        data = user.to_dict()
        self.assertNotIn('password', data)
        self.assertIn('email', data)

    def test_procurement_approval_for_verified_hospital(self) -> None:
        org = Organisation.objects.create(
            name='Verified Hospital',
            type=Organisation.Type.HOSPITAL,
            is_verified=True,
        )
        user = CustomUser.objects.create_user(
            email='procurement@example.com',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=org,
            is_verified=True,
        )
        self.assertTrue(user.can_approve_procurement(Decimal('1000000')))
        self.assertFalse(user.can_approve_procurement(Decimal('10000000')))


class OrganisationSignalTests(TestCase):
    """Test organisation creation via post_save signal."""

    def test_signal_creates_organisation_on_register(self) -> None:
        user = CustomUser(
            email='supplier@example.com',
            first_name='Jane',
            last_name='Supplier',
            role=CustomUser.Role.SUPPLIER,
        )
        user._pending_organisation_data = {
            'name': 'MedSupply Co',
            'type': Organisation.Type.SUPPLIER,
            'registration_number': 'REG-001',
            'tmda_license': 'TMDA-001',
        }
        user.set_password(VALID_PASSWORD)
        user.save()

        user.refresh_from_db()
        self.assertIsNotNone(user.organisation)
        self.assertEqual(user.organisation.name, 'MedSupply Co')


class UserSessionModelTests(TestCase):
    """Test cases for UserSession model."""

    def test_to_dict_excludes_session_token(self) -> None:
        user = CustomUser.objects.create_user(
            email='session@example.com',
            password=VALID_PASSWORD,
        )
        session = UserSession.objects.create(
            user=user,
            session_token='secret-token-value',
            expires_at=timezone.now(),
        )
        data = session.to_dict()
        self.assertNotIn('session_token', data)
        self.assertIn('user_id', data)


class RegistrationAPITests(APITestCase):
    """Integration tests for the registration endpoint."""

    def test_register_hospital_user(self) -> None:
        response = self.client.post(
            '/api/v1/auth/register/',
            {
                'email': 'newhospital@example.com',
                'password': VALID_PASSWORD,
                'first_name': 'John',
                'last_name': 'Doe',
                'role': 'HOSPITAL',
                'organisation_name': 'New Hospital',
                'organisation_type': 'HOSPITAL',
                'registration_number': 'HOSP-001',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['email'], 'newhospital@example.com')
        self.assertEqual(response.data['organisation']['name'], 'New Hospital')
        self.assertFalse(response.data['is_verified'])
        self.assertTrue(
            AuthToken.objects.filter(
                user__email='newhospital@example.com',
                token_type=AuthToken.Type.EMAIL_VERIFICATION,
            ).exists()
        )
        self.assertTrue(AuditLog.objects.filter(action='user.registered').exists())

    def test_register_rejects_weak_password(self) -> None:
        response = self.client.post(
            '/api/v1/auth/register/',
            {
                'email': 'weak@example.com',
                'password': 'short',
                'first_name': 'Jane',
                'last_name': 'Doe',
                'role': 'HOSPITAL',
                'organisation_name': 'Hospital',
                'organisation_type': 'HOSPITAL',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
        self.assertIn('code', response.data)

    def test_register_rejects_admin_role(self) -> None:
        response = self.client.post(
            '/api/v1/auth/register/',
            {
                'email': 'admin@example.com',
                'password': VALID_PASSWORD,
                'first_name': 'Admin',
                'last_name': 'User',
                'role': 'ADMIN',
                'organisation_name': 'Admin Org',
                'organisation_type': 'HOSPITAL',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class AuthEndpointAPITests(APITestCase):
    """Integration tests for login, verify, reset, and logout endpoints."""

    def setUp(self) -> None:
        self.user = CustomUser(
            email='auth@example.com',
            first_name='Auth',
            last_name='User',
            role=CustomUser.Role.HOSPITAL,
        )
        self.user._pending_organisation_data = {
            'name': 'Auth Hospital',
            'type': Organisation.Type.HOSPITAL,
        }
        self.user.set_password(VALID_PASSWORD)
        self.user.save()
        self.user.refresh_from_db()

    def test_login_returns_access_token_and_sets_cookie(self) -> None:
        response = self.client.post(
            '/api/v1/auth/login/',
            {'email': 'auth@example.com', 'password': VALID_PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('user', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertIn('refresh_token', response.cookies)
        self.assertTrue(AuditLog.objects.filter(action='user.login').exists())

    def test_verify_email_marks_user_verified(self) -> None:
        auth_token = AuthToken.objects.create(
            user=self.user,
            token='verify-token-123',
            token_type=AuthToken.Type.EMAIL_VERIFICATION,
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        response = self.client.post(f'/api/v1/auth/verify-email/{auth_token.token}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_verified)
        auth_token.refresh_from_db()
        self.assertIsNotNone(auth_token.used_at)

    def test_password_reset_confirm_invalidates_sessions(self) -> None:
        UserSession.objects.create(
            user=self.user,
            session_token='session-token',
            expires_at=timezone.now() + timezone.timedelta(days=1),
        )
        auth_token = AuthToken.objects.create(
            user=self.user,
            token='reset-token-123',
            token_type=AuthToken.Type.PASSWORD_RESET,
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        response = self.client.post(
            '/api/v1/auth/password-reset/confirm/',
            {'token': auth_token.token, 'password': 'NewSecure1!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewSecure1!'))
        self.assertEqual(UserSession.objects.filter(user=self.user).count(), 0)
