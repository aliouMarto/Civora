'use client';

import * as React from 'react';
import { Coins, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { formatXof, formatYield } from '@/lib/biens/format';
import type { BienDto } from '@civora/shared-types';

export function TabPricing({ bien }: { bien: BienDto }): React.ReactElement {
  const isVente = bien.usage === 'vente' || bien.usage === 'mixte';
  const isLoc = bien.usage === 'location_longue_duree' || bien.usage === 'mixte';

  return (
    <div className="space-y-4">
      {isVente ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            <Coins size={14} /> Prix de vente
          </div>
          <p className="mt-2 text-3xl font-semibold text-neutral-900">
            {formatXof(bien.prix_vente_xof)}
          </p>
        </Card>
      ) : null}

      {isLoc ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Loyer mensuel</p>
            <p className="mt-1 text-xl font-semibold text-neutral-900">
              {formatXof(bien.loyer_mensuel_xof)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Charges</p>
            <p className="mt-1 text-xl font-semibold text-neutral-900">
              {formatXof(bien.charges_xof)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Caution</p>
            <p className="mt-1 text-xl font-semibold text-neutral-900">
              {formatXof(bien.caution_xof)}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          <TrendingUp size={14} /> Rendement brut annuel
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-3xl font-semibold text-emerald-700">{formatYield(bien.yield_brut_pct)}</p>
          {bien.yield_updated_at ? (
            <p className="text-xs text-neutral-400">
              calculé le {new Date(bien.yield_updated_at).toLocaleDateString('fr-FR')}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Yield brut = (loyer mensuel × 12) ÷ prix de vente × 100. Inclus dans le calcul du score IA.
        </p>
      </Card>

      <Card className="p-4 bg-amber-50/40 border-amber-200">
        <p className="text-sm font-medium text-amber-900">Suggestion de pricing IA</p>
        <p className="mt-1 text-xs text-amber-800">
          Disponible en étape ultérieure du module — appelle l'IA pour comparer
          ce bien aux biens similaires (commune + type + surface) et suggérer un loyer optimal.
        </p>
      </Card>
    </div>
  );
}
