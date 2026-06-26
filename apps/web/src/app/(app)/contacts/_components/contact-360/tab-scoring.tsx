'use client';

import * as React from 'react';
import { ArrowUp, ArrowDown, BadgeInfo } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { ScoreBadge } from '../score-badge';
import {
  SCORE_BAR_CLASSES,
  categoryLabel,
  scoreVariantFromCategory,
} from '@/lib/contacts/score-colors';
import { useScoreExplanation } from '@/lib/api/contacts.api';

interface TabScoringProps {
  contactId: string;
  segmentsIa: string[];
}

export function TabScoring({ contactId, segmentsIa }: TabScoringProps): React.ReactElement {
  const { data, isLoading, isError } = useScoreExplanation(contactId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-neutral-600">Impossible de charger l'explication du score.</p>
      </Card>
    );
  }

  const variant = scoreVariantFromCategory(data.category);
  const barClass = SCORE_BAR_CLASSES[variant];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold text-neutral-900">{data.score}</span>
            <div>
              <Badge variant={variant === 'hot' ? 'success' : variant === 'warm' ? 'warning' : variant === 'cold' ? 'danger' : 'default'}>
                {categoryLabel(data.category)}
              </Badge>
              <p className="mt-1 text-xs text-neutral-500">
                Confiance : <span className="font-medium">{data.confidence}</span>
                {' · '}
                Mis à jour le {format(new Date(data.computed_at), 'd MMM yyyy', { locale: fr })}
              </p>
            </div>
          </div>
          <ScoreBadge score={data.score} size="lg" />
        </div>

        {/* Jauge */}
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${barClass} transition-all`}
            style={{ width: `${data.score}%` }}
            aria-hidden
          />
        </div>

        {data.confidence === 'low' ? (
          <p className="mt-3 flex items-start gap-1.5 text-xs italic text-amber-700">
            <BadgeInfo size={12} className="mt-0.5 shrink-0" />
            Estimation préliminaire — peu d'historique disponible. La précision augmentera avec le nombre d'interactions enregistrées.
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Facteurs détaillés
        </h3>
        {data.factors.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun facteur n'a contribué (score nul).</p>
        ) : (
          <ul className="space-y-1.5">
            {data.factors.map((f) => {
              const positive = f.contribution >= 0;
              return (
                <li key={`${f.code}-${f.contribution}`} className="flex items-center gap-2 text-sm">
                  {positive ? (
                    <ArrowUp size={14} className="text-emerald-600" aria-label="positif" />
                  ) : (
                    <ArrowDown size={14} className="text-red-600" aria-label="négatif" />
                  )}
                  <span className="text-neutral-700">{f.label}</span>
                  <span
                    className={`ml-auto font-mono text-xs font-medium ${
                      positive ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {positive ? '+' : ''}{f.contribution}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {data.formula_doc ? (
          <p className="mt-3 text-xs text-neutral-500">
            Formule détaillée :{' '}
            <a
              href={data.formula_doc}
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 hover:underline"
            >
              docs/scoring/contacts.md
            </a>
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Segments IA actuels
        </h3>
        {segmentsIa.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun segment IA pour l'instant.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {segmentsIa.map((s) => (
              <Badge key={s} variant="info">{s}</Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
