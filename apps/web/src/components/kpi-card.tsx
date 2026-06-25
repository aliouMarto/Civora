'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface KPICardProps {
  title: string;
  value?: string | number;
  change?: number;
  unit?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  placeholder?: string;
}

export function KPICard({ title, value, change, unit, icon, loading, onClick, placeholder }: KPICardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card
      onClick={onClick}
      className={[
        'p-5 transition-shadow',
        onClick ? 'cursor-pointer hover:shadow-md' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 truncate">{title}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-neutral-100" />
          ) : placeholder ? (
            <p className="mt-2 text-sm text-neutral-400 italic">{placeholder}</p>
          ) : (
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-neutral-900">
                {value ?? '—'}
              </span>
              {unit && <span className="text-sm text-neutral-500">{unit}</span>}
            </div>
          )}
          {change !== undefined && !loading && (
            <div className={[
              'mt-1.5 flex items-center gap-1 text-xs font-medium',
              isPositive ? 'text-success-600' : isNegative ? 'text-danger-600' : 'text-neutral-500',
            ].join(' ')}>
              {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : <Minus size={12} />}
              {Math.abs(change)}% vs mois préc.
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
