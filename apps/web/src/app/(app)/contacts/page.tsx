'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Sparkles, Upload, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth.store';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { useContacts, type ContactFiltersInput } from '@/lib/api/contacts.api';
import { useToast } from '@/components/ui/toast';

import { ContactsFilters } from './_components/contacts-filters';
import { ContactsTable } from './_components/contacts-table';
import { ContactsStats } from './_components/contacts-stats';
import { AskKuraContacts } from './_components/ask-kura-contacts';
import { ExportDialog } from './_components/export-dialog';

const EMPTY_PERMISSIONS: readonly string[] = [];

interface ScoreChangedEvent {
  contact_id: string;
  agence_id: string;
  score_before: number | null;
  score_after: number;
  categorie_before: string | null;
  categorie_after: string;
}

export default function ContactsPage(): React.ReactElement {
  const [filters, setFilters] = React.useState<ContactFiltersInput>({});
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useContacts(filters);
  const items = React.useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [askOpen, setAskOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);

  const permissions = useAuthStore((s) => s.user?.permissions ?? EMPTY_PERMISSIONS);
  const canExport = permissions.includes('*:*') || permissions.includes('contacts:export');
  const canWrite = permissions.includes('*:*') || permissions.includes('contacts:write');

  // Realtime : highlight transient quand un score change
  const accessToken = useAuthStore((s) => s.accessToken);
  const [liveScoreChanges, setLiveScoreChanges] = React.useState<Map<string, 'up' | 'down'>>(new Map());
  const { toast } = useToast();

  useRealtime<ScoreChangedEvent>(accessToken, 'contact.score_changed', (event) => {
    setLiveScoreChanges((prev) => {
      const next = new Map(prev);
      const before = event.score_before ?? 0;
      next.set(event.contact_id, event.score_after >= before ? 'up' : 'down');
      return next;
    });
    setTimeout(() => {
      setLiveScoreChanges((prev) => {
        const next = new Map(prev);
        next.delete(event.contact_id);
        return next;
      });
    }, 3000);
    const found = items.find((c) => c.id === event.contact_id);
    const label = found ? `${found.nom}${found.prenom ? ' ' + found.prenom : ''}` : 'Contact';
    toast({
      title: `Score de ${label}`,
      description: `${event.score_before ?? '–'} → ${event.score_after} (${event.categorie_after})`,
      variant: 'success',
    });
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(items.map((c) => c.id)) : new Set());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Contacts</h1>
          <p className="text-sm text-neutral-500">{items.length} contact(s) visible(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setAskOpen(true)}>
            <Sparkles size={14} className="mr-1.5" />
            Demander à KURA
          </Button>
          {canWrite ? (
            <Button asChild variant="secondary">
              <Link href="/contacts/import">
                <Upload size={14} className="mr-1.5" />
                Importer
              </Link>
            </Button>
          ) : null}
          {canExport ? (
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              <Download size={14} className="mr-1.5" />
              Exporter
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/contacts/new">
              <Plus size={14} className="mr-1.5" />
              Nouveau contact
            </Link>
          </Button>
        </div>
      </div>

      <ContactsStats contacts={items} />

      <ContactsFilters value={filters} onChange={setFilters} />

      {selected.size > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-primary-200 bg-primary-50 px-4 py-2 text-sm">
          <span className="font-medium text-primary-700">
            {selected.size} contact(s) sélectionné(s)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
              Tout désélectionner
            </Button>
            {canExport ? (
              <Button size="sm" variant="secondary" onClick={() => setExportOpen(true)}>
                Exporter la sélection
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ContactsTable
        items={items}
        loading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleAll}
        liveScoreChanges={liveScoreChanges}
      />

      <AskKuraContacts open={askOpen} onClose={() => setAskOpen(false)} />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filtres={filters}
        selectedIds={selected.size > 0 ? [...selected] : undefined}
      />
    </div>
  );
}
