'use client';

import * as React from 'react';
import { Search, Filter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { STATUT_LABELS, TYPE_LABELS, USAGE_LABELS } from '@/lib/biens/labels';
import type { BienStatut, BienType, BienUsage } from '@civora/shared-types';
import type { BiensFiltersInput } from '@/lib/api/biens.api';

interface BiensFiltersProps {
  value: BiensFiltersInput;
  onChange: (next: BiensFiltersInput) => void;
}

const STATUTS: BienStatut[] = ['disponible', 'loue', 'saisonnier', 'hors_circuit'];
const TYPES: BienType[] = ['villa', 'appartement', 'studio', 'bureau', 'local_commercial', 'terrain', 'immeuble', 'autre'];
const USAGES: BienUsage[] = ['vente', 'location_longue_duree', 'saisonnier', 'mixte'];

export function BiensFilters({ value, onChange }: BiensFiltersProps): React.ReactElement {
  const [localQ, setLocalQ] = React.useState(value.q ?? '');
  const debRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [advanced, setAdvanced] = React.useState(false);

  React.useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      if ((value.q ?? '') !== localQ) onChange({ ...value, q: localQ || undefined });
    }, 300);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ]);

  const toggleArray = <T,>(arr: T[] | undefined, item: T): T[] | undefined => {
    const cur = new Set(arr ?? []);
    if (cur.has(item)) cur.delete(item);
    else cur.add(item);
    return cur.size ? [...cur] : undefined;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            placeholder="Rechercher par nom, référence, description…"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            className="pl-9"
            aria-label="Recherche libre"
          />
        </div>
        <Select
          aria-label="Filtrer par usage"
          value={value.usage?.[0] ?? ''}
          onChange={(e) =>
            onChange({ ...value, usage: e.target.value ? [e.target.value as BienUsage] : undefined })
          }
        >
          <option value="">Usage — tous</option>
          {USAGES.map((u) => (
            <option key={u} value={u}>{USAGE_LABELS[u]}</option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => setAdvanced(true)}>
          <Filter size={14} className="mr-1.5" />
          Plus de filtres
        </Button>
      </div>

      {/* Chips statut */}
      <div className="flex flex-wrap gap-2">
        {STATUTS.map((s) => {
          const active = (value.statut ?? []).includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, statut: toggleArray(value.statut, s) })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {STATUT_LABELS[s]}
            </button>
          );
        })}
      </div>

      {/* Chips type */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const active = (value.type ?? []).includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, type: toggleArray(value.type, t) })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>

      <Sheet open={advanced} onClose={() => setAdvanced(false)} title="Filtres avancés" side="right">
        <div className="space-y-4 p-4">
          <div>
            <Label htmlFor="ville">Ville</Label>
            <Input
              id="ville"
              value={value.ville?.[0] ?? ''}
              onChange={(e) => onChange({ ...value, ville: e.target.value ? [e.target.value] : undefined })}
            />
          </div>
          <div>
            <Label htmlFor="commune">Commune</Label>
            <Input
              id="commune"
              value={value.commune?.[0] ?? ''}
              onChange={(e) => onChange({ ...value, commune: e.target.value ? [e.target.value] : undefined })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="loyer-min">Loyer min (centimes)</Label>
              <Input
                id="loyer-min"
                type="number"
                value={value.loyer_min ?? ''}
                onChange={(e) => onChange({ ...value, loyer_min: e.target.value || undefined })}
              />
            </div>
            <div>
              <Label htmlFor="loyer-max">Loyer max</Label>
              <Input
                id="loyer-max"
                type="number"
                value={value.loyer_max ?? ''}
                onChange={(e) => onChange({ ...value, loyer_max: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="surface-min">Surface min (m²)</Label>
              <Input
                id="surface-min"
                type="number"
                value={value.surface_min ?? ''}
                onChange={(e) =>
                  onChange({ ...value, surface_min: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label htmlFor="chambres-min">Chambres min</Label>
              <Input
                id="chambres-min"
                type="number"
                value={value.chambres_min ?? ''}
                onChange={(e) =>
                  onChange({ ...value, chambres_min: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="amenities">Amenities (csv)</Label>
            <Input
              id="amenities"
              value={(value.amenities ?? []).join(', ')}
              onChange={(e) =>
                onChange({
                  ...value,
                  amenities: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="archived"
              checked={value.include_archived ?? false}
              onChange={(e) => onChange({ ...value, include_archived: e.target.checked })}
            />
            <Label htmlFor="archived" className="!font-normal">Inclure les biens archivés</Label>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setAdvanced(false)}>Fermer</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
