from django.contrib import admin

from notifications.models import NotificationLog, NotificationTemplate


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'channel', 'is_active', 'updated_at')
    list_filter = ('channel', 'is_active')
    search_fields = ('name',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'template',
        'recipient',
        'channel',
        'status',
        'sent_at',
        'created_at',
    )
    list_filter = ('channel', 'status')
    search_fields = ('recipient__email', 'template__name')
    readonly_fields = (
        'id',
        'recipient',
        'channel',
        'template',
        'status',
        'sent_at',
        'delivery_confirmed_at',
        'error_message',
        'metadata',
        'created_at',
    )
