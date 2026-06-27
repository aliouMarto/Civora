'use client';

import * as React from 'react';
import { Calendar, FileText, Wrench, Home, ShoppingBag, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BienHistoriqueDto } from '@civora/shared-types';
import { formatXof } from '@/lib/biens/format';

interface TabHistoriqueProps {
  items: BienHistoriqueDto[];
}

const ICONS: Record<string, React.ReactElement> = {
  bail: <FileText size={14} />,
  reservation: <Calendar size={14} />,
  vente: <ShoppingBag size={14} />,
  travaux: <Wrench size={14} />,
  changement_proprietaire: <UserCheck size={14} />,
};

export function TabHistorique({ items }: TabHistoriqueProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Home size={28} className="mx-auto text-neutral-300" />
        <p className="mt-2 text-sm text-neutral-500">Aucun événement enregistré pour ce bien.</p>
        <p className="mt-1 text-xs text-neutral-400">
          La timeline se remplira au fur et à mesure (baux R2, ventes R3, réservations R4).
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <ol className="space-y-3">
        {items.map((h) => (
          <li key={h.id} className="flex gap-3 border-l-2 border-neutral-200 pl-3">
            <div className="-ml-[7px] mt-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary-500 text-white">
              {/* Pastille de la timeline */}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                  {ICONS[h.type] ?? <Home size={14} />}
                  {h.type}
                </span>
                <span className="text-xs text-neutral-500">
                  {format(new Date(h.created_at), 'd MMM yyyy', { locale: fr })}
                </span>
              </div>
              {h.debut || h.fin ? (
                <p className="text-xs text-neutral-600">
                  {h.debut ? format(new Date(h.debut), 'd MMM yyyy', { locale: fr }) : '?'}
                  {' → '}
                  {h.fin ? format(new Date(h.fin), 'd MMM yyyy', { locale: fr }) : 'en cours'}
                </p>
              ) : null}
              {h.montant_xof ? (
                <Badge variant="info">{formatXof(h.montant_xof)}</Badge>
              ) : null}
              {h.notes ? <p className="text-sm text-neutral-700">{h.notes}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
