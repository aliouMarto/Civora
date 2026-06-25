'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth.store';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { t } from '@/lib/i18n/config';

interface Notification {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function NotificationsBell() {
  const { accessToken } = useAuthStore();
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useRealtime(accessToken ?? '', 'notification.new', (data: unknown) => {
    const notif = data as Notification;
    setNotifications((prev) => [notif, ...prev].slice(0, 20));
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        aria-label={t('notifications.title')}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">{t('notifications.title')}</p>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-neutral-400">{t('notifications.empty')}</li>
            ) : (
              notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={[
                    'cursor-pointer border-b border-neutral-50 px-4 py-3 transition-colors hover:bg-neutral-50',
                    !n.read ? 'bg-primary-50/50' : '',
                  ].join(' ')}
                >
                  <p className="text-sm text-neutral-700">{n.message}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
