"""Authentication signals for MediCare Hub."""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from authentication.models import CustomUser, Organisation

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CustomUser)
def create_organisation_on_register(
    sender,
    instance: CustomUser,
    created: bool,
    **kwargs,
) -> None:
    """
    Create an Organisation when a new user registers without one.

    Registration serializers attach pending organisation data on the instance
    before the first save; this signal persists the Organisation and links it.
    """
    if not created or instance.organisation_id:
        return

    org_data = getattr(instance, '_pending_organisation_data', None)
    if not org_data:
        return

    organisation = Organisation.objects.create(**org_data)
    CustomUser.objects.filter(pk=instance.pk).update(organisation=organisation)
    instance.organisation = organisation

    logger.info(
        'Organisation created for new user',
        extra={
            'user': instance.to_dict(),
            'organisation': organisation.to_dict(),
        },
    )
