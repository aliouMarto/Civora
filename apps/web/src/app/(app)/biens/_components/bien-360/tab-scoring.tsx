'use client';

import * as React from 'react';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

import { useInsights, useScoreExplanation } from '@/lib/api/biens.api';
import { ScoreBienBadge } from '../score-bien-badge';
import { InsightsCards } from '../insights-cards';

const SUB_LABELS: Record<string, string> = {
  occupation: 'Occupation',
  rentabilite: 'Rentabilité',
  etat: 'État',
  demande: 'Demande locale',
  risque: 'Risque',
};

export function TabScoring({ bienId }: { bienId: string }): React.ReactElement {
  const { data, isLoading } = useScoreExplanation(bienId);
  const { data: insights } = useInsights({ module: 'biens', cible_id: bienId });
  const [factorsOpen, setFactorsOpen] = React.useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Score IA global
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="text-4xl font-semibold text-neutral-900">{data.global.value}</p>
              <p className="text-2xl font-medium text-neutral-500">/ 100</p>
              <ScoreBienBadge score={data.global.value} size="lg" />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Confiance :{' '}
              <Badge variant={data.global.confidence === 'high' ? 'success' : data.global.confidence === 'medium' ? 'warning' : 'default'}>
                {data.global.confidence === 'low'
                  ? 'estimation préliminaire'
                  : data.global.confidence}
              </Badge>
            </p>
          </div>
          <Button variant="secondary" onClick={() => setFactorsOpen(true)}>
            <Info size={14} className="mr-1.5" />
            Comprendre ce score
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(data.sub_scores) as Array<keyof typeof data.sub_scores>).map((k) => {
          const sub = data.sub_scores[k];
          return (
            <Card key={k} className="p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                {SUB_LABELS[k] ?? k}
              </p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900">{sub.value}</p>
              <p className="text-xs text-neutral-500">{sub.grade} · {sub.confidence}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full bg-primary-500"
                  style={{ width: `${sub.value}%` }}
                  aria-hidden
                />
              </div>
            </Card>
          );
        })}
      </div>

      {insights && insights.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-700">Insights pour ce bien</h3>
          <InsightsCards max={3} />
        </div>
      ) : null}

      <Sheet open={factorsOpen} onClose={() => setFactorsOpen(false)} title="Détail des facteurs" side="right">
        <div className="space-y-2 p-4 text-sm">
          <p className="text-xs text-neutral-500">
            La formule complète est publique sur <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">{data.formula_doc}</code>.
          </p>
          <ul className="divide-y divide-neutral-100">
            {data.factors.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm text-neutral-800">{f.label}</p>
                  <p className="text-xs text-neutral-400">{f.code} · {f.category}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 font-mono text-sm font-medium ${
                    f.contribution >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {f.contribution >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {f.contribution >= 0 ? '+' : ''}{f.contribution}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
