'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

import { StatutBadge } from './statut-badge';
import { ScoreBienBadge } from './score-bien-badge';
import { TYPE_LABELS } from '@/lib/biens/labels';
import { formatXof, formatSurface } from '@/lib/biens/format';
import type { BienDto, BienPhotoDto } from '@civora/shared-types';
import { apiFetch } from '@/lib/auth/api-client';

interface BiensGridProps {
  items: BienDto[];
  loading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function BiensGrid({
  items,
  loading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: BiensGridProps): React.ReactElement {
  if (loading && items.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-neutral-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-neutral-700">Aucun bien à afficher.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((b) => (
          <BienCard key={b.id} bien={b} />
        ))}
      </div>
      {hasNextPage ? (
        <div className="flex justify-center py-2">
          <Button variant="secondary" onClick={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BienCard({ bien }: { bien: BienDto }): React.ReactElement {
  const [thumb, setThumb] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<BienPhotoDto[]>(`/biens/${bien.id}/photos`)
      .then((photos) => {
        if (cancelled) return;
        setThumb(photos[0]?.url ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bien.id]);

  return (
    <Link href={`/biens/${bien.id}`}>
      <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative h-40 bg-neutral-100">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt={`Photo de ${bien.nom}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-300">
              <Building2 size={36} />
            </div>
          )}
          <div className="absolute left-2 top-2">
            <StatutBadge statut={bien.statut} />
          </div>
          <div className="absolute right-2 top-2">
            <ScoreBienBadge score={bien.score_ia} />
          </div>
        </div>
        <div className="space-y-1 p-3">
          <p className="text-xs font-mono text-neutral-500">{bien.reference}</p>
          <p className="line-clamp-1 text-sm font-semibold text-neutral-900">{bien.nom}</p>
          <p className="line-clamp-1 text-xs text-neutral-600">
            {TYPE_LABELS[bien.type]}
            {bien.chambres ? ` · ${bien.chambres} ch.` : ''}
            {bien.surface ? ` · ${formatSurface(bien.surface)}` : ''}
          </p>
          {bien.commune || bien.ville ? (
            <p className="flex items-center gap-1 text-xs text-neutral-500">
              <MapPin size={10} />
              {[bien.commune, bien.ville].filter(Boolean).join(', ')}
            </p>
          ) : null}
          <p className="pt-1 text-sm font-medium text-neutral-800">
            {bien.loyer_mensuel_xof
              ? `${formatXof(bien.loyer_mensuel_xof)}/mois`
              : bien.prix_vente_xof
                ? formatXof(bien.prix_vente_xof)
                : '—'}
          </p>
        </div>
      </Card>
    </Link>
  );
}
