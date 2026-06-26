'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MessageCircle, Phone, Mail, ArrowUp, ArrowDown } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

import { RoleBadge } from './role-badge';
import { ScoreBadge } from './score-badge';
import type { ContactListItem } from '@/lib/api/contacts.api';
import { labelSource } from '@/lib/contacts/source-labels';

interface ContactsTableProps {
  items: ContactListItem[];
  loading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (next: boolean) => void;
  /** Map id → indicateur live transient (haut/bas) */
  liveScoreChanges?: Map<string, 'up' | 'down'>;
}

export function ContactsTable({
  items,
  loading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  liveScoreChanges,
}: ContactsTableProps): React.ReactElement {
  const router = useRouter();
  const allChecked = items.length > 0 && items.every((c) => selectedIds.has(c.id));

  if (loading && items.length === 0) {
    return <ContactsTableSkeleton />;
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader className="w-10">
              <Checkbox
                aria-label="Sélectionner tous les contacts"
                checked={allChecked}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
              />
            </TableHeader>
            <TableHeader>Nom</TableHeader>
            <TableHeader>Rôle(s)</TableHeader>
            <TableHeader>Email</TableHeader>
            <TableHeader>Téléphone</TableHeader>
            <TableHeader>Ville</TableHeader>
            <TableHeader>Source</TableHeader>
            <TableHeader>Segments IA</TableHeader>
            <TableHeader className="text-center">Score</TableHeader>
            <TableHeader>Créé</TableHeader>
            <TableHeader>Dernière interaction</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((c) => {
            const live = liveScoreChanges?.get(c.id);
            return (
              <TableRow
                key={c.id}
                className={`cursor-pointer ${live ? 'bg-amber-50/40' : ''}`}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Sélectionner ${c.nom}`}
                    checked={selectedIds.has(c.id)}
                    onChange={() => onToggleSelect(c.id)}
                  />
                </TableCell>
                <TableCell onClick={() => router.push(`/contacts/${c.id}`)}>
                  <div className="flex flex-col">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-neutral-900 hover:text-primary-600">
                      {c.nom}
                      {c.prenom ? ` ${c.prenom}` : ''}
                    </Link>
                    {c.archived_at ? (
                      <span className="text-xs text-neutral-400">Archivé</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.roles.map((r) => (
                      <RoleBadge key={r} role={r} />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-neutral-700 hover:text-primary-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Mail size={12} aria-hidden />
                      <span className="truncate" title={c.email}>{c.email}</span>
                    </a>
                  ) : (
                    <span className="text-neutral-400">–</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.telephone ? (
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Phone size={12} aria-hidden />
                      <span>{c.telephone}</span>
                      {c.whatsapp_opt_in ? (
                        <MessageCircle size={12} className="text-emerald-600" aria-label="WhatsApp opt-in" />
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-neutral-400">–</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.ville ? (
                    <span>
                      {c.commune ? `${c.commune}, ` : ''}
                      {c.ville}
                    </span>
                  ) : (
                    <span className="text-neutral-400">–</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="default">{labelSource(c.source)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.segments_ia.length === 0 ? (
                      <span className="text-neutral-400">–</span>
                    ) : (
                      c.segments_ia.map((s) => (
                        <Badge key={s} variant="info">
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <ScoreBadge score={c.score_ia} />
                    {live === 'up' ? (
                      <ArrowUp size={12} className="animate-bounce text-emerald-500" aria-label="Score en hausse" />
                    ) : live === 'down' ? (
                      <ArrowDown size={12} className="animate-bounce text-red-500" aria-label="Score en baisse" />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-neutral-500">
                    {format(new Date(c.created_at), 'd MMM yyyy', { locale: fr })}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-neutral-500">
                    {c.derniere_interaction_at
                      ? formatDistanceToNow(new Date(c.derniere_interaction_at), {
                          addSuffix: true,
                          locale: fr,
                        })
                      : 'Aucune'}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
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

function ContactsTableSkeleton(): React.ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-neutral-700">Aucun contact ne correspond aux filtres.</p>
      <p className="mt-1 text-xs text-neutral-500">
        Ajustez vos critères ou créez votre premier contact via le bouton « + Nouveau contact ».
      </p>
    </div>
  );
}
