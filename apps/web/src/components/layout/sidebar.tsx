'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  FileText,
  CreditCard,
  Receipt,
  Wrench,
  FolderOpen,
  BarChart3,
  Settings,
  UserCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import * as React from 'react';
import { t } from '@/lib/i18n/config';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: t('nav.pilotage'),
    items: [
      { label: t('nav.dashboard'), href: '/dashboard', icon: <LayoutDashboard size={16} /> },
      { label: t('nav.rapports'), href: '/rapports', icon: <BarChart3 size={16} /> },
    ],
  },
  {
    label: t('nav.crm'),
    items: [
      { label: t('nav.contacts'), href: '/crm/contacts', icon: <Users size={16} /> },
      { label: t('nav.leads'), href: '/crm/leads', icon: <UserCheck size={16} /> },
    ],
  },
  {
    label: t('nav.immobilier'),
    items: [
      { label: t('nav.biens'), href: '/immobilier/biens', icon: <Building2 size={16} /> },
      { label: t('nav.baux'), href: '/immobilier/baux', icon: <FileText size={16} /> },
    ],
  },
  {
    label: t('nav.gestion'),
    items: [
      { label: t('nav.paiements'), href: '/gestion/paiements', icon: <CreditCard size={16} /> },
      { label: t('nav.factures'), href: '/gestion/factures', icon: <Receipt size={16} /> },
      { label: t('nav.maintenances'), href: '/gestion/maintenances', icon: <Wrench size={16} /> },
      { label: t('nav.documents'), href: '/gestion/documents', icon: <FolderOpen size={16} /> },
    ],
  },
  {
    label: t('nav.systeme'),
    items: [
      { label: t('nav.utilisateurs'), href: '/system/utilisateurs', icon: <UserCircle size={16} /> },
      { label: t('nav.parametres'), href: '/settings/profile', icon: <Settings size={16} /> },
    ],
  },
];

interface SidebarProps {
  agenceNom?: string;
}

export function Sidebar({ agenceNom = 'CIVORA' }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  function toggleGroup(label: string) {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col" style={{ backgroundColor: '#0f172a' }}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold text-sm">
          C
        </div>
        <div>
          <p className="text-sm font-semibold text-white">CIVORA</p>
          <p className="text-xs text-neutral-400 truncate max-w-[120px]">{agenceNom}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((group) => {
          const isCollapsed = collapsed[group.label];
          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {group.label}
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              {!isCollapsed && (
                <ul className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={[
                            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-primary-600 text-white font-medium'
                              : 'text-neutral-400 hover:bg-white/10 hover:text-white',
                          ].join(' ')}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* AI button */}
      <div className="border-t border-white/10 p-3">
        <button className="flex w-full items-center gap-2.5 rounded-lg bg-primary-600/20 px-3 py-2.5 text-sm font-medium text-primary-300 transition-colors hover:bg-primary-600/30">
          <Sparkles size={16} />
          {t('nav.ai')}
        </button>
      </div>
    </aside>
  );
}
