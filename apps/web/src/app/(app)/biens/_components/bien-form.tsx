'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateBienSchema, BIEN_STATUTS, BIEN_TYPES, BIEN_USAGES, type CreateBienInput } from '@civora/shared-types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';

import { STATUT_LABELS, TYPE_LABELS, USAGE_LABELS } from '@/lib/biens/labels';
import { useCreateBien, useUpdateBien } from '@/lib/api/biens.api';

interface BienFormProps {
  mode: 'create' | 'edit';
  bienId?: string;
  initial?: Partial<CreateBienInput>;
}

/**
 * Formulaire bien — single-page avec sections accordéon.
 * Validation client zod (CreateBienSchema partagé avec l'API).
 *
 * Money : on saisit en FCFA (UI) et on convertit en centimes (BigInt
 * via string) au submit. Le DTO côté API attend des bigints.
 */
export function BienForm({ mode, bienId, initial }: BienFormProps): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const createMut = useCreateBien();
  const updateMut = useUpdateBien(bienId ?? '');

  const form = useForm<CreateBienInput>({
    resolver: zodResolver(CreateBienSchema),
    defaultValues: {
      nom: initial?.nom ?? '',
      description: initial?.description,
      type: initial?.type ?? 'villa',
      usage: initial?.usage ?? 'location_longue_duree',
      statut: initial?.statut ?? 'disponible',
      surface: initial?.surface,
      pieces: initial?.pieces,
      chambres: initial?.chambres,
      salles_bain: initial?.salles_bain,
      etage: initial?.etage,
      annee_construction: initial?.annee_construction,
      amenities: initial?.amenities ?? [],
      adresse_ligne1: initial?.adresse_ligne1 ?? '',
      adresse_ligne2: initial?.adresse_ligne2,
      ville: initial?.ville ?? 'Abidjan',
      commune: initial?.commune,
      pays: initial?.pays ?? 'CI',
      latitude: initial?.latitude,
      longitude: initial?.longitude,
      prix_vente_xof: initial?.prix_vente_xof,
      loyer_mensuel_xof: initial?.loyer_mensuel_xof,
      charges_xof: initial?.charges_xof,
      caution_xof: initial?.caution_xof,
      proprietaire_id: initial?.proprietaire_id,
      agent_responsable_id: initial?.agent_responsable_id,
      tags: initial?.tags ?? [],
    },
  });

  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (mode === 'create') {
        const created = await createMut.mutateAsync(values);
        toast({ title: 'Bien créé', description: created.reference, variant: 'success' });
        router.push(`/biens/${created.id}`);
      } else if (bienId) {
        await updateMut.mutateAsync(values);
        toast({ title: 'Bien mis à jour', variant: 'success' });
        router.push(`/biens/${bienId}`);
      }
    } catch (err) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'error' });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Section title="1. Identification">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="nom" required>Nom</Label>
            <Input id="nom" {...form.register('nom')} />
            {errors.nom ? <ErrorMsg>{errors.nom.message}</ErrorMsg> : null}
          </div>
          <div>
            <Label htmlFor="type" required>Type</Label>
            <Select id="type" {...form.register('type')}>
              {BIEN_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="usage" required>Usage</Label>
            <Select id="usage" {...form.register('usage')}>
              {BIEN_USAGES.map((u) => (
                <option key={u} value={u}>{USAGE_LABELS[u]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="statut">Statut</Label>
            <Select id="statut" {...form.register('statut')}>
              {BIEN_STATUTS.map((s) => (
                <option key={s} value={s}>{STATUT_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} {...form.register('description')} />
          </div>
        </div>
      </Section>

      <Section title="2. Localisation">
        <p className="mb-3 text-xs text-neutral-500">
          Si vous fournissez latitude + longitude sans commune, CIVORA tentera de
          remplir automatiquement la commune via Mapbox (reverse-geocoding).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="adresse_ligne1" required>Adresse</Label>
            <Input id="adresse_ligne1" {...form.register('adresse_ligne1')} />
            {errors.adresse_ligne1 ? <ErrorMsg>{errors.adresse_ligne1.message}</ErrorMsg> : null}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="adresse_ligne2">Complément</Label>
            <Input id="adresse_ligne2" {...form.register('adresse_ligne2')} />
          </div>
          <div>
            <Label htmlFor="ville" required>Ville</Label>
            <Input id="ville" {...form.register('ville')} />
          </div>
          <div>
            <Label htmlFor="commune">Commune</Label>
            <Input id="commune" {...form.register('commune')} />
          </div>
          <div>
            <Label htmlFor="pays">Pays (ISO 2)</Label>
            <Input id="pays" maxLength={2} {...form.register('pays')} />
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                {...form.register('latitude', { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                {...form.register('longitude', { valueAsNumber: true })}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="3. Caractéristiques & équipements">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="surface">Surface (m²)</Label>
            <Input id="surface" type="number" step="0.01" {...form.register('surface', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="pieces">Pièces</Label>
            <Input id="pieces" type="number" {...form.register('pieces', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="chambres">Chambres</Label>
            <Input id="chambres" type="number" {...form.register('chambres', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="salles_bain">Salles de bain</Label>
            <Input id="salles_bain" type="number" {...form.register('salles_bain', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="etage">Étage</Label>
            <Input id="etage" type="number" {...form.register('etage', { valueAsNumber: true })} />
          </div>
          <div>
            <Label htmlFor="annee_construction">Année construction</Label>
            <Input
              id="annee_construction"
              type="number"
              {...form.register('annee_construction', { valueAsNumber: true })}
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="amenities">Équipements (séparés par virgule)</Label>
            <Controller
              control={form.control}
              name="amenities"
              render={({ field }) => (
                <Input
                  id="amenities"
                  value={(field.value ?? []).join(', ')}
                  onChange={(e) =>
                    field.onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                  }
                  placeholder="piscine, climatisation, jardin, parking, meuble"
                />
              )}
            />
          </div>
        </div>
      </Section>

      <Section title="4. Pricing & relations">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="prix_vente">Prix de vente (FCFA)</Label>
            <Input
              id="prix_vente"
              type="number"
              placeholder="ex: 250000000"
              onChange={(e) =>
                form.setValue(
                  'prix_vente_xof',
                  e.target.value ? (BigInt(e.target.value) * 100n) : undefined,
                  { shouldValidate: true },
                )
              }
            />
            {errors.prix_vente_xof ? <ErrorMsg>{errors.prix_vente_xof.message}</ErrorMsg> : null}
          </div>
          <div>
            <Label htmlFor="loyer">Loyer mensuel (FCFA)</Label>
            <Input
              id="loyer"
              type="number"
              placeholder="ex: 850000"
              onChange={(e) =>
                form.setValue(
                  'loyer_mensuel_xof',
                  e.target.value ? (BigInt(e.target.value) * 100n) : undefined,
                  { shouldValidate: true },
                )
              }
            />
            {errors.loyer_mensuel_xof ? <ErrorMsg>{errors.loyer_mensuel_xof.message}</ErrorMsg> : null}
          </div>
          <div>
            <Label htmlFor="charges">Charges mensuelles (FCFA)</Label>
            <Input
              id="charges"
              type="number"
              onChange={(e) =>
                form.setValue(
                  'charges_xof',
                  e.target.value ? (BigInt(e.target.value) * 100n) : undefined,
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="caution">Caution (FCFA)</Label>
            <Input
              id="caution"
              type="number"
              onChange={(e) =>
                form.setValue(
                  'caution_xof',
                  e.target.value ? (BigInt(e.target.value) * 100n) : undefined,
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="proprietaire_id">ID propriétaire (Contact)</Label>
            <Input
              id="proprietaire_id"
              placeholder="UUID Contact rôle proprietaire"
              {...form.register('proprietaire_id')}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Combobox dédiée arrive en sprint suivant. Pour l'instant, coller l'UUID
              du Contact propriétaire (créer côté Contacts d'abord).
            </p>
          </div>
          <div>
            <Label htmlFor="agent_responsable_id">ID agent responsable</Label>
            <Input
              id="agent_responsable_id"
              placeholder="UUID utilisateur"
              {...form.register('agent_responsable_id')}
            />
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-white py-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Annuler</Button>
        <Button
          type="submit"
          loading={createMut.isPending || updateMut.isPending}
        >
          {mode === 'create' ? 'Créer le bien' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
      {children}
    </Card>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}
