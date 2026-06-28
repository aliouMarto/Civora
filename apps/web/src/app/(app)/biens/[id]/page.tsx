'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Archive, Copy, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

import { StatutBadge } from '../_components/statut-badge';
import { ScoreBienBadge } from '../_components/score-bien-badge';
import { TabInfos } from '../_components/bien-360/tab-infos';
import { TabPricing } from '../_components/bien-360/tab-pricing';
import { TabOccupation } from '../_components/bien-360/tab-occupation';
import { TabPhotos } from '../_components/bien-360/tab-photos';
import { TabHistorique } from '../_components/bien-360/tab-historique';
import { TabDocuments } from '../_components/bien-360/tab-documents';
import { TabScoring } from '../_components/bien-360/tab-scoring';

import { useArchiveBien, useBien } from '@/lib/api/biens.api';
import { useAuthStore } from '@/lib/store/auth.store';

const EMPTY_PERMISSIONS: readonly string[] = [];

type TabValue = 'infos' | 'pricing' | 'occupation' | 'photos' | 'historique' | 'documents' | 'scoring';

const TABS: Array<{ label: string; value: TabValue }> = [
  { label: 'Infos générales', value: 'infos' },
  { label: 'Pricing', value: 'pricing' },
  { label: 'Occupation', value: 'occupation' },
  { label: 'Photos', value: 'photos' },
  { label: 'Historique', value: 'historique' },
  { label: 'Documents', value: 'documents' },
  { label: 'Scoring & IA', value: 'scoring' },
];

export default function BienFichePage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data: bien, isLoading, error } = useBien(id);
  const archive = useArchiveBien();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<TabValue>('infos');

  const permissions = useAuthStore((s) => s.user?.permissions ?? EMPTY_PERMISSIONS);
  const canWrite = permissions.includes('*:*') || permissions.includes('biens:write');
  const canDelete = permissions.includes('*:*') || permissions.includes('biens:delete');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !bien) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-800">Bien introuvable</p>
        <p className="mt-1 text-xs text-red-700">Ce bien n'existe pas ou n'appartient pas à votre agence.</p>
        <Button asChild className="mt-3">
          <Link href="/biens">Retour à la liste</Link>
        </Button>
      </div>
    );
  }

  const onArchive = async () => {
    if (!confirm(`Archiver le bien ${bien.nom} ?`)) return;
    try {
      await archive.mutateAsync(bien.id);
      toast({ title: 'Bien archivé', variant: 'success' });
      router.push('/biens');
    } catch (err) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/biens"
            className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} /> Retour à la liste
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-neutral-900">{bien.nom}</h1>
            <StatutBadge statut={bien.statut} size="md" />
            <ScoreBienBadge score={bien.score_ia} size="md" />
          </div>
          <p className="text-sm text-neutral-500">
            <span className="font-mono">{bien.reference}</span> ·{' '}
            <MapPin size={12} className="inline" />{' '}
            {[bien.commune, bien.ville].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <Button asChild variant="secondary">
              <Link href={`/biens/${bien.id}/edit`}>
                <Edit size={14} className="mr-1.5" />
                Éditer
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" disabled title="Dupliquer — bientôt">
            <Copy size={14} className="mr-1.5" />
            Dupliquer
          </Button>
          {canDelete && !bien.archived_at ? (
            <Button variant="danger" onClick={onArchive} loading={archive.isPending}>
              <Archive size={14} className="mr-1.5" />
              Archiver
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ label: t.label, value: t.value }))}
        value={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="pt-2">
        {tab === 'infos' && <TabInfos bien={bien} />}
        {tab === 'pricing' && <TabPricing bien={bien} />}
        {tab === 'occupation' && <TabOccupation bien={bien} />}
        {tab === 'photos' && <TabPhotos bienId={bien.id} />}
        {tab === 'historique' && <TabHistorique items={bien.historique ?? []} />}
        {tab === 'documents' && <TabDocuments />}
        {tab === 'scoring' && <TabScoring bienId={bien.id} />}
      </div>
    </div>
  );
}
