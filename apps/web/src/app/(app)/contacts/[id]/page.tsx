'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Phone,
  Pencil,
  Trash2,
  Sparkles,
  Plus,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Sheet } from '@/components/ui/sheet';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth.store';

import {
  useArchiveContact,
  useContact,
  useScoreExplanation,
  useUpdateContact,
} from '@/lib/api/contacts.api';

import { ScoreBadge } from '../_components/score-badge';
import { RoleBadge } from '../_components/role-badge';
import { TabProfile } from '../_components/contact-360/tab-profile';
import { TabRelations } from '../_components/contact-360/tab-relations';
import { TabInteractions } from '../_components/contact-360/tab-interactions';
import { TabScoring } from '../_components/contact-360/tab-scoring';
import { ContactForm } from '../_components/contact-form';

function hasPermission(perms: string[], required: string): boolean {
  return perms.includes('*:*') || perms.includes(required);
}

function initialsOf(nom: string, prenom: string | null): string {
  const first = (prenom?.charAt(0) ?? '').toUpperCase();
  const last = (nom?.charAt(0) ?? '').toUpperCase();
  return `${first}${last}` || '??';
}

function avatarColorClass(seed: string): string {
  // Hash très simple — couleur stable par contact.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const palette = [
    'bg-emerald-500',
    'bg-sky-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  return palette[hash % palette.length]!;
}

type TabValue = 'profile' | 'relations' | 'interactions' | 'scoring';

export default function ContactDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;
  const { data, isLoading, isError, error } = useContact(id);
  const { toast } = useToast();
  const archiveMut = useArchiveContact();
  const updateMut = useUpdateContact(id ?? '');

  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = hasPermission(permissions, 'contacts:write');
  const canDelete = hasPermission(permissions, 'contacts:delete');

  const [tab, setTab] = React.useState<TabValue>('profile');
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [scoreDrawerOpen, setScoreDrawerOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // 404 si contact introuvable
  if (isError) {
    const status = (error as Error & { status?: number })?.status;
    if (status === 404) {
      return (
        <Card className="mx-auto max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">Contact introuvable</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Ce contact n'existe pas ou n'appartient pas à votre agence.
          </p>
          <Link href="/contacts" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            ← Retour à la liste
          </Link>
        </Card>
      );
    }
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h2 className="text-lg font-semibold text-red-700">Erreur</h2>
        <p className="mt-2 text-sm text-neutral-600">{(error as Error).message}</p>
      </Card>
    );
  }

  if (!data) return <></>;

  const fullName = `${data.nom}${data.prenom ? ' ' + data.prenom : ''}`;
  const initials = initialsOf(data.nom, data.prenom);
  const avatarClass = avatarColorClass(data.id);

  const onArchive = async () => {
    try {
      await archiveMut.mutateAsync(data.id);
      toast({ title: 'Contact archivé', description: fullName, variant: 'success' });
      setArchiveOpen(false);
      router.push('/contacts');
    } catch (err) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </Link>
      </div>

      {/* En-tête */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold text-white ${avatarClass}`}
            aria-label={`Avatar ${initials}`}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-neutral-900">{fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {data.roles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
              {data.segments_ia.map((s) => (
                <Badge key={s} variant="info">{s}</Badge>
              ))}
              {data.archived_at ? <Badge variant="danger">Archivé</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-600">
              {data.email ? (
                <a href={`mailto:${data.email}`} className="hover:text-primary-600">
                  <Mail size={12} className="mr-1 inline" />
                  {data.email}
                </a>
              ) : null}
              {data.telephone ? (
                <a href={`tel:${data.telephone}`} className="hover:text-primary-600">
                  <Phone size={12} className="mr-1 inline" />
                  {data.telephone}
                </a>
              ) : null}
              {data.whatsapp && data.whatsapp_opt_in ? (
                <span className="text-emerald-600">
                  <MessageCircle size={12} className="mr-1 inline" />
                  WhatsApp opt-in
                </span>
              ) : null}
              {data.ville ? (
                <span>
                  {[data.commune, data.ville].filter(Boolean).join(', ')}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setScoreDrawerOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 pr-3 transition-colors hover:bg-neutral-50"
              aria-label="Comprendre ce score"
            >
              <ScoreBadge score={data.score_ia} size="lg" />
              <span className="text-xs text-neutral-600">Comprendre</span>
            </button>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {data.telephone ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={`tel:${data.telephone}`} title="Appeler">
                    <Phone size={14} /> Appeler
                  </a>
                </Button>
              ) : null}
              {data.email ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={`mailto:${data.email}`} title="Email">
                    <Mail size={14} /> Email
                  </a>
                </Button>
              ) : null}
              {data.whatsapp && data.whatsapp_opt_in ? (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`https://wa.me/${data.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setTab('interactions')}>
                <Plus size={14} /> Interaction
              </Button>
              {canWrite ? (
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} /> Éditer
                </Button>
              ) : null}
              {canDelete && !data.archived_at ? (
                <Button variant="danger" size="sm" onClick={() => setArchiveOpen(true)}>
                  <Trash2 size={14} /> Archiver
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* Onglets */}
      <Tabs
        tabs={[
          { value: 'profile', label: 'Profil' },
          { value: 'relations', label: 'Relations immobilières' },
          { value: 'interactions', label: 'Interactions & activités' },
          { value: 'scoring', label: 'Scoring & segments IA' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div>
        {tab === 'profile' && <TabProfile contact={data} />}
        {tab === 'relations' && <TabRelations />}
        {tab === 'interactions' && (
          <TabInteractions contactId={data.id} canWrite={canWrite} />
        )}
        {tab === 'scoring' && (
          <TabScoring contactId={data.id} segmentsIa={data.segments_ia} />
        )}
      </div>

      {/* Drawer score explanation */}
      <Sheet open={scoreDrawerOpen} onClose={() => setScoreDrawerOpen(false)} side="right">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <Sparkles size={14} /> Comprendre ce score
          </div>
          <TabScoring contactId={data.id} segmentsIa={data.segments_ia} />
        </div>
      </Sheet>

      {/* Modal édition */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={`Éditer ${fullName}`}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          <ContactForm
            mode="edit"
            contactId={data.id}
            initial={{
              nom: data.nom,
              prenom: data.prenom ?? undefined,
              genre: data.genre ?? undefined,
              langue: data.langue,
              email: data.email ?? undefined,
              telephone: data.telephone ?? undefined,
              whatsapp: data.whatsapp ?? undefined,
              whatsapp_opt_in: data.whatsapp_opt_in,
              adresse_ligne1: data.adresse_ligne1 ?? undefined,
              adresse_ligne2: data.adresse_ligne2 ?? undefined,
              ville: data.ville ?? undefined,
              commune: data.commune ?? undefined,
              pays: data.pays,
              roles: data.roles,
              source: data.source ?? undefined,
              tags: data.tags,
            }}
            onSuccess={() => setEditOpen(false)}
          />
        </div>
      </Dialog>

      {/* Confirm archive */}
      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)} title="Archiver ce contact ?">
        <div className="space-y-3 p-4">
          <p className="text-sm text-neutral-600">
            Le contact sera masqué des listes par défaut. Aucune donnée n'est supprimée — vous pourrez le restaurer plus tard.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>Annuler</Button>
            <Button variant="danger" onClick={onArchive} loading={archiveMut.isPending}>
              Archiver
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
