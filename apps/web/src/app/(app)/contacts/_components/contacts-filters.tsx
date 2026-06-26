'use client';

import * as React from 'react';
import { Search, Filter, Save } from 'lucide-react';
import { CONTACT_ROLES, CONTACT_SCORE_CATEGORIES, CONTACT_SOURCES, type ContactRole, type ContactScoreCategorie, type ContactSource } from '@civora/shared-types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet } from '@/components/ui/sheet';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { ROLE_LABELS } from '@/lib/contacts/role-labels';
import { SOURCE_LABELS } from '@/lib/contacts/source-labels';
import { useToast } from '@/components/ui/toast';
import { useCreateSegment } from '@/lib/api/contacts.api';
import type { ContactFiltersInput } from '@/lib/api/contacts.api';

interface ContactsFiltersProps {
  value: ContactFiltersInput;
  onChange: (next: ContactFiltersInput) => void;
}

export function ContactsFilters({ value, onChange }: ContactsFiltersProps): React.ReactElement {
  const [localQ, setLocalQ] = React.useState<string>(value.q ?? '');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce de la recherche libre (300 ms) — déclenche un fetch serveur.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if ((value.q ?? '') !== localQ) {
        onChange({ ...value, q: localQ || undefined });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ]);

  const toggleRole = (role: ContactRole) => {
    const current = new Set(value.role ?? []);
    if (current.has(role)) current.delete(role);
    else current.add(role);
    onChange({ ...value, role: current.size > 0 ? [...current] : undefined });
  };

  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            placeholder="Rechercher par nom, email, téléphone…"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            className="pl-9"
            aria-label="Recherche libre"
          />
        </div>

        <Select
          aria-label="Filtrer par score IA"
          value={value.score_categorie ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              score_categorie: (e.target.value || undefined) as ContactScoreCategorie | undefined,
            })
          }
        >
          <option value="">Score IA — tous</option>
          {CONTACT_SCORE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === 'froid' ? 'Froid (<40)' : c === 'tiede' ? 'Tiède (40–69)' : 'Chaud (≥70)'}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtrer par source"
          value={value.source ?? ''}
          onChange={(e) =>
            onChange({ ...value, source: (e.target.value || undefined) as ContactSource | undefined })
          }
        >
          <option value="">Source — toutes</option>
          {CONTACT_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">
          <Checkbox
            aria-label="WhatsApp opt-in uniquement"
            checked={value.whatsapp_opt_in ?? false}
            onChange={(e) =>
              onChange({ ...value, whatsapp_opt_in: e.target.checked ? true : undefined })
            }
          />
          WhatsApp opt-in
        </label>

        <Button variant="secondary" onClick={() => setAdvancedOpen(true)}>
          <Filter size={14} className="mr-1.5" />
          Plus de filtres
        </Button>

        <Button variant="secondary" onClick={() => setSaveOpen(true)}>
          <Save size={14} className="mr-1.5" />
          Sauvegarder en segment
        </Button>
      </div>

      {/* Chips rôles */}
      <div className="flex flex-wrap gap-2">
        {CONTACT_ROLES.map((r) => {
          const active = (value.role ?? []).includes(r);
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

      <Sheet open={advancedOpen} onClose={() => setAdvancedOpen(false)} title="Filtres avancés">
        <div className="space-y-4 p-4">
          <div>
            <Label htmlFor="adv-ville">Ville</Label>
            <Input
              id="adv-ville"
              value={value.ville ?? ''}
              onChange={(e) => onChange({ ...value, ville: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="adv-commune">Commune</Label>
            <Input
              id="adv-commune"
              value={value.commune ?? ''}
              onChange={(e) => onChange({ ...value, commune: e.target.value || undefined })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="adv-min">Score min</Label>
              <Input
                id="adv-min"
                type="number"
                min={0}
                max={100}
                value={value.score_min ?? ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    score_min: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="adv-max">Score max</Label>
              <Input
                id="adv-max"
                type="number"
                min={0}
                max={100}
                value={value.score_max ?? ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    score_max: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="adv-tags">Tags (séparés par virgule)</Label>
            <Input
              id="adv-tags"
              value={(value.tags ?? []).join(', ')}
              onChange={(e) =>
                onChange({
                  ...value,
                  tags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="adv-archived"
              checked={value.include_archived ?? false}
              onChange={(e) => onChange({ ...value, include_archived: e.target.checked })}
            />
            <Label htmlFor="adv-archived" className="!font-normal">Inclure les contacts archivés</Label>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setAdvancedOpen(false)}>Fermer</Button>
          </div>
        </div>
      </Sheet>

      <SaveSegmentDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        currentFilters={value}
      />
    </div>
  );
}

function SaveSegmentDialog({
  open,
  onClose,
  currentFilters,
}: {
  open: boolean;
  onClose: () => void;
  currentFilters: ContactFiltersInput;
}): React.ReactElement {
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const create = useCreateSegment();
  const { toast } = useToast();

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        nom: name.trim(),
        description: desc.trim() || undefined,
        filtres: {
          roles: currentFilters.role,
          tags: currentFilters.tags,
          segments_ia: currentFilters.segments_ia,
          ville: currentFilters.ville,
          commune: currentFilters.commune,
          source: currentFilters.source,
          score_min: currentFilters.score_min,
          score_max: currentFilters.score_max,
          score_categorie: currentFilters.score_categorie,
          whatsapp_opt_in: currentFilters.whatsapp_opt_in,
        },
      });
      toast({ title: 'Segment créé', description: `« ${name} » a été enregistré.`, variant: 'success' });
      setName('');
      setDesc('');
      onClose();
    } catch (err) {
      toast({ title: 'Échec création segment', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Sauvegarder le filtre en segment">
      <div className="space-y-3 p-4">
        <div>
          <Label htmlFor="seg-name" required>Nom du segment</Label>
          <Input
            id="seg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VIPs Cocody"
          />
        </div>
        <div>
          <Label htmlFor="seg-desc">Description (optionnelle)</Label>
          <Input
            id="seg-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Propriétaires score ≥ 80 à Cocody"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Enregistrement…' : 'Créer le segment'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
