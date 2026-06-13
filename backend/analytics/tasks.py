"""Celery tasks for the analytics app."""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)
