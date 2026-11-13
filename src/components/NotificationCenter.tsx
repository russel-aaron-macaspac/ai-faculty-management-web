'use client';

import { useState } from 'react';
import { Bell, X, CheckCircle2, XCircle, AlertCircle, Loader2, CalendarDays, ClipboardCheck } from 'lucide-react';
import type { ClearanceNotificationState } from '@/hooks/useClearanceNotifications';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NotificationCenterProps {
  userId: string | number | null;
  notificationState: ClearanceNotificationState;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId, notificationState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = notificationState;

  if (!userId) return null;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'clearance_approved':
        return <CheckCircle2 className="h-5 w-5 text-slate-500" />;
      case 'clearance_rejected':
        return <XCircle className="h-5 w-5 text-slate-500" />;
      case 'clearance_submitted':
        return <AlertCircle className="h-5 w-5 text-slate-500" />;
      case 'clearance_note_added':
        return <AlertCircle className="h-5 w-5 text-slate-500" />;
      case 'clearance_deleted':
        return <XCircle className="h-5 w-5 text-slate-500" />;
      case 'schedule_created':
      case 'schedule_updated':
      case 'schedule_deleted':
      case 'schedule_approved':
        return <CalendarDays className="h-5 w-5 text-slate-500" />;
      case 'schedule_anomaly':
        return <AlertCircle className="h-5 w-5 text-slate-500" />;
      case 'unauthorized_access':
        return <XCircle className="h-5 w-5 text-slate-500" />;
      default:
        return <Bell className="h-5 w-5 text-slate-500" />;
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
      <div className="divide-y divide-slate-200">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            className={`group relative w-full px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
              notification.is_read
                ? 'bg-white'
                : 'border-l-4 border-l-slate-700 bg-slate-50'
            }`}
            onClick={() => {
              if (!notification.is_read) {
                markAsRead(notification.id);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold leading-5 text-slate-900">{notification.title}</p>
                </div>
                <p className="mt-1.5 text-sm leading-5 text-slate-600 line-clamp-3">
                  {notification.message}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {format(new Date(notification.created_at), 'MMM d, yyyy · h:mm a')}
                </p>
              </div>
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
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
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
        <div className="absolute right-0 z-50 mt-3 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  className="whitespace-nowrap text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Mark all as read
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:bg-slate-100 hover:text-slate-900"
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
