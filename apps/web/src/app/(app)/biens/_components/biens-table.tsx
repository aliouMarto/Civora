'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { StatutBadge } from './statut-badge';
import { ScoreBienBadge } from './score-bien-badge';
import type { BienDto } from '@civora/shared-types';
import { TYPE_LABELS, USAGE_LABELS } from '@/lib/biens/labels';
import { formatXof, formatYield, formatSurface } from '@/lib/biens/format';

interface BiensTableProps {
  items: BienDto[];
  loading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function BiensTable({
  items,
  loading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: BiensTableProps): React.ReactElement {
  const router = useRouter();

  if (loading && items.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Réf</TableHeader>
            <TableHeader>Nom</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Usage</TableHeader>
            <TableHeader>Commune</TableHeader>
            <TableHeader>Statut</TableHeader>
            <TableHeader>Prix / Loyer</TableHeader>
            <TableHeader>Surface</TableHeader>
            <TableHeader>Yield</TableHeader>
            <TableHeader className="text-center">Score</TableHeader>
            <TableHeader>Créé</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((b) => (
            <TableRow
              key={b.id}
              className="cursor-pointer"
            >
              <TableCell onClick={() => router.push(`/biens/${b.id}`)}>
                <span className="font-mono text-xs text-neutral-600">{b.reference}</span>
                {b.archived_at ? (
                  <Badge variant="default" className="ml-2">Archivé</Badge>
                ) : null}
              </TableCell>
              <TableCell onClick={() => router.push(`/biens/${b.id}`)}>
                <Link href={`/biens/${b.id}`} className="font-medium text-neutral-900 hover:text-primary-600">
                  {b.nom}
                </Link>
              </TableCell>
              <TableCell>{TYPE_LABELS[b.type]}</TableCell>
              <TableCell className="text-xs text-neutral-600">{USAGE_LABELS[b.usage]}</TableCell>
              <TableCell>
                {b.commune ? (
                  <span>
                    {b.commune}, <span className="text-xs text-neutral-500">{b.ville}</span>
                  </span>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatutBadge statut={b.statut} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs">
                  {b.loyer_mensuel_xof ? (
                    <span>{formatXof(b.loyer_mensuel_xof)}/mois</span>
                  ) : null}
                  {b.prix_vente_xof ? (
                    <span className="text-neutral-500">{formatXof(b.prix_vente_xof)} vente</span>
                  ) : null}
                  {!b.loyer_mensuel_xof && !b.prix_vente_xof ? (
                    <span className="text-neutral-400">—</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-xs">{formatSurface(b.surface)}</TableCell>
              <TableCell className="text-xs">{formatYield(b.yield_brut_pct)}</TableCell>
              <TableCell className="text-center">
                <ScoreBienBadge score={b.score_ia} />
              </TableCell>
              <TableCell className="text-xs text-neutral-500">
                {format(new Date(b.created_at), 'd MMM yyyy', { locale: fr })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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

function EmptyState(): React.ReactElement {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-neutral-700">Aucun bien ne correspond aux filtres.</p>
      <p className="mt-1 text-xs text-neutral-500">
        Ajustez vos critères ou créez votre premier bien via le bouton « + Nouveau bien ».
      </p>
    </div>
  );
}
