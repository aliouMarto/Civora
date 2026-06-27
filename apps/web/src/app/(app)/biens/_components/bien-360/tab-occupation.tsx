'use client';

import * as React from 'react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatutBadge } from '../statut-badge';
import type { BienDto } from '@civora/shared-types';

export function TabOccupation({ bien }: { bien: BienDto }): React.ReactElement {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Statut actuel</p>
        <div className="mt-2 flex items-center gap-3">
          <StatutBadge statut={bien.statut} size="md" />
          <Badge variant={bien.statut_source === 'manuel' ? 'default' : 'info'}>
            Source : {bien.statut_source}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {bien.statut_source === 'manuel'
            ? 'Statut saisi manuellement par l\'agence.'
            : `Statut dérivé automatiquement depuis le module ${bien.statut_source === 'bail' ? 'Locations longue durée' : 'Saisonnier'}.`}
        </p>
      </Card>

      <Card className="p-4 border-dashed bg-neutral-50/60">
        <p className="text-sm font-semibold text-neutral-700">Historique de bail</p>
        <p className="mt-1 text-xs text-neutral-500">
          Sera enrichi quand le module <strong>Locations longue durée (R2)</strong>
          {' '}sera actif. Les baux passés et en cours apparaîtront ici avec leur
          durée, loyer et statut.
        </p>
      </Card>

      <Card className="p-4 border-dashed bg-neutral-50/60">
        <p className="text-sm font-semibold text-neutral-700">Historique saisonnier</p>
        <p className="mt-1 text-xs text-neutral-500">
          Sera enrichi quand le module <strong>Saisonnier (R4)</strong> sera actif.
          Les réservations passées et taux de remplissage apparaîtront ici.
        </p>
      </Card>
    </div>
  );
}
