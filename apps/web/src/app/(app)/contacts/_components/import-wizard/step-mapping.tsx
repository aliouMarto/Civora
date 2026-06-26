'use client';

import * as React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

export const SUPPORTED_FIELDS = [
  'nom',
  'prenom',
  'genre',
  'langue',
  'email',
  'telephone',
  'whatsapp',
  'whatsapp_opt_in',
  'ville',
  'commune',
  'pays',
  'roles',
  'source',
  'tags',
] as const;

const FIELD_LABEL: Record<(typeof SUPPORTED_FIELDS)[number], string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  genre: 'Genre',
  langue: 'Langue',
  email: 'Email',
  telephone: 'Téléphone',
  whatsapp: 'WhatsApp',
  whatsapp_opt_in: 'WhatsApp opt-in',
  ville: 'Ville',
  commune: 'Commune',
  pays: 'Pays',
  roles: 'Rôles',
  source: 'Source',
  tags: 'Tags',
};

interface StepMappingProps {
  headers: string[];
  suggested: Record<string, string>;
  value: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  onContinue: () => void;
  onResetSuggested: () => void;
}

export function StepMapping({
  headers,
  suggested,
  value,
  onChange,
  onContinue,
  onResetSuggested,
}: StepMappingProps): React.ReactElement {
  const hasNom = Boolean(value['nom']);
  const hasChannel = Boolean(value['email']) || Boolean(value['telephone']);
  const canContinue = hasNom && hasChannel;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Mapping des colonnes</h3>
          <p className="text-xs text-neutral-500">
            Associez chaque colonne de votre fichier à un champ Civora. Au minimum :
            <strong> nom</strong> + <strong>email ou téléphone</strong>.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onResetSuggested}>
          <RefreshCw size={14} className="mr-1.5" /> Suggestion auto
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SUPPORTED_FIELDS.map((field) => (
          <div key={field}>
            <Label htmlFor={`map-${field}`} required={field === 'nom'}>
              {FIELD_LABEL[field]}{' '}
              {suggested[field] && suggested[field] === value[field] ? (
                <span className="ml-1 text-xs font-normal text-emerald-600">(auto)</span>
              ) : null}
            </Label>
            <Select
              id={`map-${field}`}
              value={value[field] ?? ''}
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value) next[field] = e.target.value;
                else delete next[field];
                onChange(next);
              }}
            >
              <option value="">— ne pas importer —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs">
        <p className={canContinue ? 'text-emerald-600' : 'text-amber-700'}>
          {canContinue
            ? '✓ Mapping minimum valide.'
            : 'Mappez au moins le nom + un canal (email ou téléphone).'}
        </p>
        <Button onClick={onContinue} disabled={!canContinue}>
          Aperçu <ArrowRight size={14} className="ml-1.5" />
        </Button>
      </div>
    </Card>
  );
}
