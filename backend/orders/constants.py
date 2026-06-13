"""Order domain constants and default configuration."""

from decimal import Decimal

DEFAULT_APPROVAL_THRESHOLDS: tuple[dict[str, object], ...] = (
    {
        'step_number': 1,
        'required_role': 'HOD',
        'threshold_amount': Decimal('500000'),
    },
    {
        'step_number': 2,
        'required_role': 'CFO',
        'threshold_amount': Decimal('2000000'),
    },
)

CART_REDIS_KEY_PREFIX = 'cart'
CART_TTL_SECONDS = 24 * 60 * 60

PAYMENT_INSTRUCTIONS: dict[str, str] = {
    'IMMEDIATE': (
        'Payment is due immediately. Complete payment via mobile money or bank '
        'transfer within 24 hours to confirm your order.'
    ),
    'NET30': 'Payment is due within 30 days of invoice date.',
    'NET60': 'Payment is due within 60 days of invoice date.',
    'NET90': 'Payment is due within 90 days of invoice date.',
}
