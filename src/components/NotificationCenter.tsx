'use client';

import { useState } from 'react';
import { Bell, X, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useClearanceNotifications } from '@/hooks/useClearanceNotifications';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
        return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
      case 'clearance_rejected':
        return <XCircle className="h-5 w-5 text-rose-600" />;
      case 'clearance_submitted':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'schedule_anomaly':
        return <AlertCircle className="h-5 w-5 text-amber-700" />;
      case 'unauthorized_access':
        return <XCircle className="h-5 w-5 text-rose-700" />;
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
        <div className="flex items-center justify-center gap-2 p-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2">Loading...</span>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div className="p-8 text-center text-slate-500">
          <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No notifications yet</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            className={`w-full border-l-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${
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
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                  {notification.message}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              {!notification.is_read && (
                <div className="shrink-0 mt-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-xl p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 min-w-6 justify-center px-1.5 py-0.5 text-[10px]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
              <p className="text-sm text-slate-500">Recent clearance and schedule updates</p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                >
                  Mark all as read
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Close notifications"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '28rem' }}>
            {renderNotificationContent()}
          </div>
        </div>
      )}
    </div>
  );
};
