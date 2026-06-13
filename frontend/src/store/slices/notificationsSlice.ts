import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import type { AppNotification } from '@/types';

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<AppNotification, 'id' | 'read' | 'createdAt'>>) => {
      const notification: AppNotification = {
        ...action.payload,
        id: crypto.randomUUID(),
        read: false,
        createdAt: new Date().toISOString(),
      };
      state.items.unshift(notification);
      state.unreadCount += 1;
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.items.find((item) => item.id === action.payload);

      if (notification && !notification.read) {
        notification.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllAsRead: (state) => {
      state.items.forEach((item) => {
        item.read = true;
      });
      state.unreadCount = 0;
    },
    clearNotifications: (state) => {
      state.items = [];
      state.unreadCount = 0;
    },
  },
});

export const {
  addNotification,
  markAsRead,
  markAllAsRead,
  clearNotifications,
} = notificationsSlice.actions;
export default notificationsSlice.reducer;
