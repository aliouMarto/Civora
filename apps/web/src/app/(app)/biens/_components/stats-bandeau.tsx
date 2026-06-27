'use client';

import * as React from 'react';
import { Building2, Coins, TrendingUp, Activity, Receipt } from 'lucide-react';

import { KPICard } from '@/components/kpi-card';
import { formatXof } from '@/lib/biens/format';
import { usePortefeuilleStat } from '@/lib/api/biens.api';

interface StatsBandeauProps {
  onClickKpi?: (id: 'total' | 'valeur' | 'mrr' | 'occupation' | 'revenus') => void;
}

export function StatsBandeau({ onClickKpi }: StatsBandeauProps): React.ReactElement {
  const { data, isLoading } = usePortefeuilleStat();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KPICard
        title="Biens"
        value={data?.total_biens ?? '—'}
        loading={isLoading}
        icon={<Building2 size={16} />}
        onClick={onClickKpi ? () => onClickKpi('total') : undefined}
      />
      <KPICard
        title="Valeur portefeuille"
        value={data ? formatXof(data.valeur_patrimoniale_xof) : '—'}
        loading={isLoading}
        icon={<Coins size={16} />}
        onClick={onClickKpi ? () => onClickKpi('valeur') : undefined}
      />
      <KPICard
        title="MRR théorique"
        value={data ? formatXof(data.mrr_theorique_xof) : '—'}
        loading={isLoading}
        icon={<TrendingUp size={16} />}
        onClick={onClickKpi ? () => onClickKpi('mrr') : undefined}
      />
      <KPICard
        title="Taux d'occupation"
        value={data ? `${data.taux_occupation_pct}%` : '—'}
        loading={isLoading}
        icon={<Activity size={16} />}
        onClick={onClickKpi ? () => onClickKpi('occupation') : undefined}
      />
      <KPICard
        title="Revenus du mois"
        placeholder="Disponible avec R2 (Locations)"
        icon={<Receipt size={16} />}
      />
    </div>
  );
}
