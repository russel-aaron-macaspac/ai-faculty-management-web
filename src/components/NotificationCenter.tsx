'use client';

import { useState } from 'react';
import { Bell, X, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useClearanceNotifications } from '@/hooks/useClearanceNotifications';
import { format } from 'date-fns';

interface NotificationCenterProps {
  userId: string | null;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useClearanceNotifications(userId);

  if (!userId) return null;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'clearance_approved':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'clearance_rejected':
        return <XCircle className="h-5 w-5 text-rose-500" />;
      case 'clearance_submitted':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'schedule_anomaly':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'unauthorized_access':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Bell className="h-5 w-5 text-slate-500" />;
    }
  };

  const getNotificationClass = (type: string) => {
    switch (type) {
      case 'clearance_approved':
        return 'bg-emerald-50 border-emerald-200';
      case 'clearance_rejected':
        return 'bg-rose-50 border-rose-200';
      case 'clearance_submitted':
        return 'bg-amber-50 border-amber-200';
      case 'schedule_anomaly':
        return 'bg-amber-50 border-amber-300';
      case 'unauthorized_access':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const renderNotificationContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2">Loading...</span>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div className="p-8 text-center text-slate-500">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No notifications yet</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-200">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            className={`w-full p-4 hover:bg-slate-50 transition-colors border-l-4 text-left ${
              notification.is_read ? 'border-slate-200' : 'border-red-500'
            } ${getNotificationClass(notification.type)}`}
            onClick={() => {
              if (!notification.is_read) {
                markAsRead(notification.id);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-1">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{notification.title}</p>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                  {notification.message}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              {!notification.is_read && (
                <div className="shrink-0 w-2 h-2 mt-2 rounded-full bg-red-500" />
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-6">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-slate-200 z-50">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-600 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {renderNotificationContent()}
          </div>
        </div>
      )}
    </div>
  );
};
