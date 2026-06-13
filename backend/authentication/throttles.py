"""Rate limiting for authentication endpoints."""

from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

class LoginIPThrottle(SimpleRateThrottle):
    """Limit login attempts to 5 per 15 minutes per IP address."""

    scope = 'login'
    num_requests = 5
    duration = 900  # 15 minutes in seconds

    def get_cache_key(self, request, view) -> str:
        ident = self.get_ident(request)
        return f'throttle_login_{ident}'

    def allow_request(self, request, view) -> bool:
        if self.rate is None:
            return True

        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True

        self.history = cache.get(self.key, [])
        self.now = self.timer()

        while self.history and self.history[-1] <= self.now - self.duration:
            self.history.pop()

        if len(self.history) >= self.num_requests:
            return self.throttle_failure()

        return self.throttle_success()

    def throttle_success(self) -> bool:
        self.history.insert(0, self.now)
        cache.set(self.key, self.history, self.duration)
        return True

    def throttle_failure(self) -> bool:
        return False

    def wait(self) -> float | None:
        if not self.history:
            return None
        remaining_duration = self.duration - (self.now - self.history[-1])
        return remaining_duration


class PasswordResetEmailThrottle(SimpleRateThrottle):
    """Limit password reset requests to 3 per hour per email address."""

    scope = 'password_reset'
    num_requests = 3
    duration = 3600  # 1 hour in seconds

    def get_cache_key(self, request, view) -> str:
        email = request.data.get('email', '').lower().strip()
        if not email:
            return None
        return f'throttle_pwd_reset_{email}'

    def allow_request(self, request, view) -> bool:
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True

        self.history = cache.get(self.key, [])
        self.now = self.timer()

        while self.history and self.history[-1] <= self.now - self.duration:
            self.history.pop()

        if len(self.history) >= self.num_requests:
            return self.throttle_failure()

        return self.throttle_success()

    def throttle_success(self) -> bool:
        self.history.insert(0, self.now)
        cache.set(self.key, self.history, self.duration)
        return True

    def throttle_failure(self) -> bool:
        return False

    def wait(self) -> float | None:
        if not self.history:
            return None
        remaining_duration = self.duration - (self.now - self.history[-1])
        return remaining_duration
