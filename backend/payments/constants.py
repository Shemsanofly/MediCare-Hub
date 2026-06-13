"""Payment gateway constants."""

GATEWAY_MPESA = 'mpesa'
GATEWAY_SELCOM = 'selcom'
GATEWAY_AIRTEL = 'airtel'

SUPPORTED_GATEWAYS = (GATEWAY_MPESA, GATEWAY_SELCOM, GATEWAY_AIRTEL)

MPESA_OAUTH_CACHE_KEY = 'payments:mpesa:oauth_token'
AIRTEL_OAUTH_CACHE_KEY = 'payments:airtel:oauth_token'
OAUTH_REFRESH_BUFFER_SECONDS = 60
