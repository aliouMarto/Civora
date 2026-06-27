'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, X, Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  useDismissInsight,
  useActedOnInsight,
  useInsights,
} from '@/lib/api/biens.api';

interface InsightsCardsProps {
  max?: number;
}

/**
 * Affiche jusqu'à `max` insights actifs (dismissed=false), priorisant
 * critical > warn > info. Chaque card est dismissible et a une action.
 */
export function InsightsCards({ max = 3 }: InsightsCardsProps): React.ReactElement | null {
  const { data, isLoading } = useInsights({ module: 'biens', limit: 20 });
  const dismiss = useDismissInsight();
  const actedOn = useActedOnInsight();
  const { toast } = useToast();

  if (isLoading || !data || data.length === 0) return null;

  // Tri par sévérité puis date, puis on prend les `max` premiers
  const ordered = [...data].sort((a, b) => {
    const sevA = sevOrder(a.severity);
    const sevB = sevOrder(b.severity);
    if (sevA !== sevB) return sevB - sevA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const visible = ordered.slice(0, max);

  const onDismiss = async (id: string) => {
    try {
      await dismiss.mutateAsync(id);
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'error' });
    }
  };
  const onAct = async (id: string) => {
    try {
      await actedOn.mutateAsync(id);
      toast({ title: 'Marqué comme traité', variant: 'success' });
    } catch (e) {
      toast({ title: 'Erreur', description: (e as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {visible.map((i) => (
        <Card
          key={i.id}
          className={`relative flex flex-col gap-2 border-l-4 p-4 ${
            i.severity === 'critical'
              ? 'border-l-red-500'
              : i.severity === 'warn'
                ? 'border-l-amber-500'
                : 'border-l-blue-500'
          }`}
        >
          <button
            type="button"
            onClick={() => void onDismiss(i.id)}
            className="absolute right-2 top-2 rounded p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label="Ignorer cet insight"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            {iconForSeverity(i.severity)}
            <span>
              {labelForSeverity(i.severity)} · {labelForType(i.type)}
            </span>
          </div>
          <p className="text-sm font-semibold text-neutral-900">{i.titre}</p>
          <p className="text-xs text-neutral-600">{i.message}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            {i.action_url ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={i.action_url}>{i.action_label ?? 'Voir'}</Link>
              </Button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => void onAct(i.id)}
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
              aria-label="Marquer comme traité"
            >
              <Check size={12} /> Traité
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function sevOrder(s: string): number {
  if (s === 'critical') return 3;
  if (s === 'warn') return 2;
  return 1;
}

function iconForSeverity(s: string): React.ReactElement {
  if (s === 'critical') return <AlertTriangle size={12} className="text-red-600" />;
  if (s === 'warn') return <AlertTriangle size={12} className="text-amber-600" />;
  return <Info size={12} className="text-blue-600" />;
}

function labelForSeverity(s: string): string {
  if (s === 'critical') return 'Critique';
  if (s === 'warn') return 'À vérifier';
  return 'Info';
}

function labelForType(t: string): string {
  switch (t) {
    case 'anomalie_loyer':
    case 'anomalie_prix':
      return 'Anomalie';
    case 'pricing_sur_marche':
      return 'Au-dessus marché';
    case 'pricing_sous_marche':
      return 'Sous-marché';
    case 'diversification_faible':
      return 'Diversification';
    case 'demande_forte_zone':
      return 'Opportunité';
    default:
      return t;
  }
}
