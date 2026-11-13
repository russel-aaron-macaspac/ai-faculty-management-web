import { useState, useEffect, useCallback } from 'react';
import { clearanceService } from '@/services/clearanceService';
import { ClearanceNotification } from '@/types/clearance';

export interface ClearanceNotificationState {
  notifications: ClearanceNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: (unreadOnly?: boolean) => Promise<void>;
}

export const useClearanceNotifications = (userId: string | number | null): ClearanceNotificationState => {
  const [notifications, setNotifications] = useState<ClearanceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async (unreadOnly: boolean = false) => {
    if (userId == null || !String(userId).trim()) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const currentUserId = userId;
    setLoading(true);
    try {
      const data = await clearanceService.getNotifications(currentUserId, unreadOnly);
      setNotifications(data);
      setUnreadCount(data.filter((n: ClearanceNotification) => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await clearanceService.markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (userId == null || !String(userId).trim()) return;
    const currentUserId = userId;
    try {
      await clearanceService.markAllNotificationsAsRead(currentUserId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [userId]);

  // Fetch on mount
  useEffect(() => {
    if (userId != null && String(userId).trim()) {
      fetchNotifications();
      // Set up polling for new notifications every 30 seconds
      const interval = setInterval(() => fetchNotifications(), 30000);
      return () => clearInterval(interval);
    }
  }, [userId, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
};
