'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONTACT_GENRES,
  CONTACT_LANGUES,
  CONTACT_ROLES,
  CONTACT_SOURCES,
  CreateContactSchema,
  type ContactRole,
  type CreateContactInput,
} from '@civora/shared-types';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

import { ROLE_LABELS } from '@/lib/contacts/role-labels';
import { SOURCE_LABELS } from '@/lib/contacts/source-labels';
import {
  useCheckDuplicates,
  useCreateContact,
  useUpdateContact,
} from '@/lib/api/contacts.api';
import { DedupDialog } from './dedup-dialog';

interface ContactFormProps {
  mode: 'create' | 'edit';
  initial?: Partial<CreateContactInput>;
  contactId?: string;
  /** Callback après succès ; par défaut redirige vers la fiche 360°. */
  onSuccess?: (id: string) => void;
}

export function ContactForm({ mode, initial, contactId, onSuccess }: ContactFormProps): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const createMut = useCreateContact();
  const updateMut = useUpdateContact(contactId ?? '');
  const dedupMut = useCheckDuplicates();

  const [dedupMatches, setDedupMatches] = React.useState<Awaited<ReturnType<typeof dedupMut.mutateAsync>>['matches']>([]);
  const [dedupOpen, setDedupOpen] = React.useState(false);
  const [forceCreate, setForceCreate] = React.useState(false);

  const form = useForm<CreateContactInput>({
    resolver: zodResolver(CreateContactSchema),
    defaultValues: {
      nom: initial?.nom ?? '',
      prenom: initial?.prenom ?? undefined,
      genre: initial?.genre,
      langue: initial?.langue ?? 'fr',
      email: initial?.email,
      telephone: initial?.telephone,
      whatsapp: initial?.whatsapp,
      whatsapp_opt_in: initial?.whatsapp_opt_in ?? false,
      adresse_ligne1: initial?.adresse_ligne1,
      adresse_ligne2: initial?.adresse_ligne2,
      ville: initial?.ville,
      commune: initial?.commune,
      pays: initial?.pays ?? 'CI',
      roles: (initial?.roles ?? []) as ContactRole[],
      source: initial?.source,
      tags: initial?.tags ?? [],
    },
  });

  // Background dedup check (debounce 500ms) sur email/téléphone
  const emailWatch = form.watch('email');
  const phoneWatch = form.watch('telephone');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (mode !== 'create') return;
    if (!emailWatch && !phoneWatch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await dedupMut.mutateAsync({
          email: emailWatch || undefined,
          telephone: phoneWatch || undefined,
        });
        const hard = res.matches.filter((m) => m.matched_on.includes('email') || m.matched_on.includes('telephone'));
        if (hard.length > 0 && !forceCreate) {
          setDedupMatches(res.matches);
          setDedupOpen(true);
        }
      } catch {
        // silencieux : la dedup est best-effort
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailWatch, phoneWatch, mode, forceCreate]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (mode === 'create') {
        const created = await createMut.mutateAsync(values);
        toast({ title: 'Contact créé', description: `${created.nom}${created.prenom ? ' ' + created.prenom : ''}`, variant: 'success' });
        if (onSuccess) onSuccess(created.id);
        else router.push(`/contacts/${created.id}`);
      } else if (contactId) {
        const updated = await updateMut.mutateAsync(values);
        toast({ title: 'Contact mis à jour', variant: 'success' });
        if (onSuccess) onSuccess(updated.id);
      }
    } catch (err) {
      const msg = (err as Error).message;
      // Détection 409 doublon serveur
      if (msg.toLowerCase().includes('existe déjà') || msg.toLowerCase().includes('conflict')) {
        toast({ title: 'Doublon détecté', description: msg, variant: 'error' });
      } else {
        toast({ title: 'Erreur', description: msg, variant: 'error' });
      }
    }
  });

  const toggleRole = (r: ContactRole) => {
    const current = new Set(form.getValues('roles') ?? []);
    if (current.has(r)) current.delete(r);
    else current.add(r);
    form.setValue('roles', [...current] as ContactRole[], { shouldValidate: true });
  };

  const rolesValue = form.watch('roles') ?? [];
  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {/* Section 1 — Identité */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Identité</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="nom" required>Nom</Label>
            <Input id="nom" {...form.register('nom')} aria-invalid={Boolean(errors.nom)} />
            {errors.nom ? <p className="mt-1 text-xs text-red-600">{errors.nom.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="prenom">Prénom</Label>
            <Input id="prenom" {...form.register('prenom')} />
          </div>
          <div>
            <Label htmlFor="genre">Genre</Label>
            <Select id="genre" {...form.register('genre')}>
              <option value="">—</option>
              {CONTACT_GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="langue">Langue</Label>
            <Select id="langue" {...form.register('langue')}>
              {CONTACT_LANGUES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      {/* Section 2 — Canaux */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Canaux</h2>
        <p className="text-xs text-neutral-500">Au moins l'email ou le téléphone doit être renseigné.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register('email')} />
            {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="telephone">Téléphone (E.164, ex. +2250707070707)</Label>
            <Input id="telephone" {...form.register('telephone')} placeholder="+2250707070707" />
            {errors.telephone ? <p className="mt-1 text-xs text-red-600">{errors.telephone.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="whatsapp">WhatsApp (E.164)</Label>
            <Input id="whatsapp" {...form.register('whatsapp')} placeholder="+2250707070707" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Controller
              control={form.control}
              name="whatsapp_opt_in"
              render={({ field }) => (
                <Checkbox
                  id="wa-opt-in"
                  checked={field.value ?? false}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              )}
            />
            <Label htmlFor="wa-opt-in" className="!font-normal">
              Le contact a explicitement accepté de recevoir des WhatsApp
            </Label>
          </div>
        </div>
      </section>

      {/* Section 3 — Détails */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Détails</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="source">Source</Label>
            <Select id="source" {...form.register('source')}>
              <option value="">—</option>
              {CONTACT_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pays">Pays (ISO 3166-1 alpha-2)</Label>
            <Input id="pays" {...form.register('pays')} placeholder="CI" maxLength={2} />
          </div>
          <div>
            <Label htmlFor="adresse1">Adresse</Label>
            <Input id="adresse1" {...form.register('adresse_ligne1')} />
          </div>
          <div>
            <Label htmlFor="adresse2">Complément d'adresse</Label>
            <Input id="adresse2" {...form.register('adresse_ligne2')} />
          </div>
          <div>
            <Label htmlFor="ville">Ville</Label>
            <Input id="ville" {...form.register('ville')} />
          </div>
          <div>
            <Label htmlFor="commune">Commune</Label>
            <Input id="commune" {...form.register('commune')} />
          </div>
          <div className="md:col-span-2">
            <Label>Rôles cumulables</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {CONTACT_ROLES.map((r) => {
                const active = rolesValue.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="tags">Tags (séparés par virgule)</Label>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <Textarea
                  id="tags"
                  rows={2}
                  value={(field.value ?? []).join(', ')}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    )
                  }
                />
              )}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Annuler</Button>
        <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
          {mode === 'create' ? 'Créer le contact' : 'Enregistrer'}
        </Button>
      </div>

      <DedupDialog
        open={dedupOpen}
        onClose={() => setDedupOpen(false)}
        matches={dedupMatches}
        onContinue={() => {
          setForceCreate(true);
          setDedupOpen(false);
        }}
      />
    </form>
  );
}
