'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth.store';
import { NotificationsBell } from './notifications-bell';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/app/actions/auth';
import { t } from '@/lib/i18n/config';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { user, clearSession } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    await logoutAction();
    clearSession();
    router.push('/login');
  }

  const initials = user
    ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6">
      {/* Left: page title */}
      <div>
        {title && <h1 className="text-base font-semibold text-neutral-900">{title}</h1>}
      </div>

      {/* Right: bell + user menu */}
      <div className="flex items-center gap-2">
        <NotificationsBell />

        <DropdownMenu
          trigger={
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
                {initials}
              </div>
              <span className="hidden sm:inline-block max-w-[120px] truncate font-medium">
                {user ? `${user.prenom} ${user.nom}` : '…'}
              </span>
              <ChevronDown size={14} className="text-neutral-400" />
            </button>
          }
        >
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-neutral-900">
              {user ? `${user.prenom} ${user.nom}` : ''}
            </p>
            <p className="text-xs text-neutral-500">{user?.email}</p>
          </div>
          <DropdownSeparator />
          <DropdownItem onClick={() => router.push('/settings/profile')}>
            <User size={14} />
            {t('nav.profil')}
          </DropdownItem>
          <DropdownItem onClick={() => router.push('/settings/profile')}>
            <Settings size={14} />
            {t('nav.parametres')}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={handleLogout} danger>
            <LogOut size={14} />
            {t('nav.deconnexion')}
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
