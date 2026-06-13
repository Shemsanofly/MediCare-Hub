"""Seed default notification templates for standard platform events."""

from django.core.management.base import BaseCommand

from notifications.constants import STANDARD_NOTIFICATION_EVENTS
from notifications.models import NotificationTemplate

DEFAULT_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    'order_placed': {
        'subject': 'Order {{ order_id }} placed',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Your order {{ order_id }} has been placed successfully.\n'
            'Total: {{ total_amount }} {{ currency }}.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Order {{ order_id }} placed. Total {{ total_amount }} {{ currency }}.',
        'push_body': 'Order {{ order_id }} has been placed.',
    },
    'order_approved': {
        'subject': 'Order {{ order_id }} approved',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Order {{ order_id }} has been approved and is ready for confirmation.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Order {{ order_id }} approved.',
        'push_body': 'Order {{ order_id }} has been approved.',
    },
    'order_confirmed': {
        'subject': 'Order {{ order_id }} confirmed',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Order {{ order_id }} has been confirmed by the supplier.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Order {{ order_id }} confirmed.',
        'push_body': 'Order {{ order_id }} has been confirmed.',
    },
    'payment_received': {
        'subject': 'Payment received for order {{ order_id }}',
        'body': (
            'Hello {{ first_name }},\n\n'
            'We received your payment of {{ amount }} {{ currency }} for order {{ order_id }}.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Payment {{ amount }} {{ currency }} received for order {{ order_id }}.',
        'push_body': 'Payment received for order {{ order_id }}.',
    },
    'order_shipped': {
        'subject': 'Order {{ order_id }} shipped',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Order {{ order_id }} has been shipped.'
            '{% if tracking_number %} Tracking: {{ tracking_number }}.{% endif %}\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Order {{ order_id }} shipped.',
        'push_body': 'Order {{ order_id }} has been shipped.',
    },
    'order_delivered': {
        'subject': 'Order {{ order_id }} delivered',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Order {{ order_id }} has been delivered. Please confirm receipt in the portal.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Order {{ order_id }} delivered.',
        'push_body': 'Order {{ order_id }} has been delivered.',
    },
    'stock_low': {
        'subject': 'Low stock alert: {{ product_name }}',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Stock for {{ product_name }} is low ({{ quantity_remaining }} remaining).\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Low stock for {{ product_name }} ({{ quantity_remaining }} left).',
        'push_body': 'Low stock: {{ product_name }} ({{ quantity_remaining }} remaining).',
    },
    'expiry_alert': {
        'subject': 'Expiry alert: {{ product_name }}',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Batch {{ batch_number }} of {{ product_name }} expires on {{ expiry_date }}.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: {{ product_name }} batch {{ batch_number }} expires {{ expiry_date }}.',
        'push_body': '{{ product_name }} batch expires on {{ expiry_date }}.',
    },
    'supplier_verified': {
        'subject': 'Supplier account verified',
        'body': (
            'Hello {{ first_name }},\n\n'
            'Your supplier organisation {{ organisation_name }} has been verified on MediCare Hub.\n\n'
            '— MediCare Hub'
        ),
        'sms': 'MediCare Hub: Supplier {{ organisation_name }} verified.',
        'push_body': 'Supplier account {{ organisation_name }} has been verified.',
    },
}


class Command(BaseCommand):
    help = 'Create or update default notification templates for standard events.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--channels',
            nargs='+',
            default=['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'],
            help='Channels to seed (default: all).',
        )

    def handle(self, *args, **options):
        channels = [channel.upper() for channel in options['channels']]
        created = 0
        updated = 0

        for event in STANDARD_NOTIFICATION_EVENTS:
            templates = DEFAULT_TEMPLATES.get(event)
            if templates is None:
                self.stderr.write(self.style.WARNING(f'No defaults for event: {event}'))
                continue

            subject = templates['subject']
            email_body = templates['body']
            sms_body = templates['sms']
            push_body = templates['push_body']

            channel_payloads = {
                NotificationTemplate.Channel.EMAIL: (subject, email_body),
                NotificationTemplate.Channel.SMS: ('', sms_body),
                NotificationTemplate.Channel.WHATSAPP: ('', sms_body),
                NotificationTemplate.Channel.PUSH: (subject, push_body),
            }

            for channel in channels:
                if channel not in channel_payloads:
                    continue
                subject_template, body_template = channel_payloads[channel]
                _, was_created = NotificationTemplate.objects.update_or_create(
                    name=event,
                    channel=channel,
                    defaults={
                        'subject_template': subject_template,
                        'body_template': body_template,
                        'is_active': True,
                    },
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Notification templates seeded: {created} created, {updated} updated.',
            ),
        )
