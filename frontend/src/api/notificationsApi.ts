import { apiClient } from './axiosConfig';

export interface BackendNotification {
  id: string;
  title?: string;
  message?: string;
  read?: boolean;
  [key: string]: unknown;
}

/** Notifications API endpoints. */
export const notificationsApi = {
  listNotifications: () =>
    apiClient.get<{ results: BackendNotification[] }>(
      '/notifications/notifications/',
    ),

  getNotification: (notificationId: string) =>
    apiClient.get<BackendNotification>(
      `/notifications/notifications/${notificationId}/`,
    ),

  markAsRead: (notificationId: string, read = true) =>
    apiClient.patch<BackendNotification>(
      `/notifications/notifications/${notificationId}/`,
      { read },
    ),
};
