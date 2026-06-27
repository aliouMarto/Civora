'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth.store';

import { BiensFilters } from './_components/biens-filters';
import { BiensGrid } from './_components/biens-grid';
import { BiensMap } from './_components/biens-map';
import { BiensTable } from './_components/biens-table';
import { BiensToggleView, type BiensView } from './_components/biens-toggle-view';
import { InsightsCards } from './_components/insights-cards';
import { StatsBandeau } from './_components/stats-bandeau';
import { AskKuraBiens } from './_components/ask-kura-biens';
import { useBiens, type BiensFiltersInput } from '@/lib/api/biens.api';

const VIEW_STORAGE_KEY = 'civora:biens:view';

export default function BiensPage(): React.ReactElement {
  const [view, setView] = React.useState<BiensView>('list');
  const [filters, setFilters] = React.useState<BiensFiltersInput>({});
  const [askOpen, setAskOpen] = React.useState(false);

  // Persistance du choix de vue
  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (stored === 'list' || stored === 'grid' || stored === 'map') setView(stored);
  }, []);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = permissions.includes('*:*') || permissions.includes('biens:write');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useBiens(filters);
  const items = React.useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Biens immobiliers</h1>
          <p className="text-sm text-neutral-500">{items.length} bien(s) visible(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <BiensToggleView value={view} onChange={setView} />
          <Button variant="secondary" onClick={() => setAskOpen(true)}>
            <Sparkles size={14} className="mr-1.5" />
            Demander à KURA
          </Button>
          {canWrite ? (
            <Button asChild>
              <Link href="/biens/new">
                <Plus size={14} className="mr-1.5" />
                Nouveau bien
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <StatsBandeau />

      <InsightsCards max={3} />

      <BiensFilters value={filters} onChange={setFilters} />

      {view === 'list' ? (
        <BiensTable
          items={items}
          loading={isLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      ) : view === 'grid' ? (
        <BiensGrid
          items={items}
          loading={isLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      ) : (
        <BiensMap />
      )}

      <AskKuraBiens open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}
