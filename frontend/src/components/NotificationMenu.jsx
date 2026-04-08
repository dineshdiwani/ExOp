import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_LABELS = {
  offer: 'Offer',
  booking: 'Booking',
  payment: 'Payment',
  call: 'Call',
  call_reminder: 'Reminder',
  chat: 'Chat',
  review: 'Review',
  system: 'System',
};

export default function NotificationMenu() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const visibleItems = useMemo(() => notifications.slice(0, 8), [notifications]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const [listRes, countRes] = await Promise.all([
        axios.get(`${API_URL}/api/notifications`, { params: { limit: 20 } }),
        axios.get(`${API_URL}/api/notifications/unread-count`)
      ]);
      setNotifications(listRes.data || []);
      setUnreadCount(countRes.data?.unread_count || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socket.on('notification_event', (notification) => {
      if (!notification) return;
      setNotifications((prev) => [notification, ...prev].slice(0, 40));
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.off('notification_event');
      socket.disconnect();
    };
  }, [token]);

  const markAllRead = async () => {
    await axios.put(`${API_URL}/api/notifications/read-all`);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
    setUnreadCount(0);
  };

  const markOneRead = async (notificationId) => {
    await axios.put(`${API_URL}/api/notifications/${notificationId}/read`);
    setNotifications((prev) => prev.map((n) => n.notification_id === notificationId ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(prev - 1, 0));
  };

  const handleClickNotification = async (notification) => {
    if (!notification.is_read) {
      await markOneRead(notification.notification_id);
    }
    setOpen(false);

    if (notification.booking_id) {
      navigate(`/booking/${notification.booking_id}`);
      return;
    }
    if (notification.issue_id) {
      navigate(`/issues/${notification.issue_id}`);
    }
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} data-testid="notifications-btn">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-5 text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="font-semibold text-slate-900">Notifications</p>
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Loading notifications...</p>
            ) : visibleItems.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleItems.map((notification) => (
                  <button
                    key={notification.notification_id}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${notification.is_read ? 'bg-white' : 'bg-sky-50/40'}`}
                    onClick={() => handleClickNotification(notification)}
                    data-testid={`notification-${notification.notification_id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-900 text-sm line-clamp-1">{notification.title}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABELS[notification.category] || 'Update'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{notification.body}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
