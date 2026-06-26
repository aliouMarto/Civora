'use client';

import * as React from 'react';
import { Flame, Users, MessageCircle, Sparkles } from 'lucide-react';

import { KPICard } from '@/components/kpi-card';
import type { ContactListItem } from '@/lib/api/contacts.api';

interface ContactsStatsProps {
  contacts: ContactListItem[];
  total?: number;
}

/**
 * KPI dérivés de la page courante (calcul léger). Un endpoint dédié sera
 * exposé en étape .5 (analytics agrégées par agence).
 */
export function ContactsStats({ contacts, total }: ContactsStatsProps): React.ReactElement {
  const hot = contacts.filter((c) => (c.score_ia ?? 0) >= 70).length;
  const waOptIn = contacts.filter((c) => c.whatsapp_opt_in).length;
  const waPct = contacts.length === 0 ? 0 : Math.round((waOptIn / contacts.length) * 100);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = contacts.filter(
    (c) =>
      c.derniere_interaction_at &&
      new Date(c.derniere_interaction_at).getTime() >= sevenDaysAgo.getTime(),
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KPICard title="Contacts" value={total ?? contacts.length} icon={<Users size={16} />} />
      <KPICard title="Chauds (≥ 70)" value={hot} icon={<Flame size={16} />} />
      <KPICard title="WhatsApp opt-in" value={`${waPct}%`} icon={<MessageCircle size={16} />} />
      <KPICard title="Activité 7j" value={recent} icon={<Sparkles size={16} />} />
    </div>
  );
}
