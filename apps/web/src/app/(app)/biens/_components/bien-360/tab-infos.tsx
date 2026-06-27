'use client';

import * as React from 'react';
import { Building2, MapPin, Calendar } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { TYPE_LABELS, USAGE_LABELS, labelAmenity } from '@/lib/biens/labels';
import { formatSurface } from '@/lib/biens/format';
import type { BienDto } from '@civora/shared-types';

export function TabInfos({ bien }: { bien: BienDto }): React.ReactElement {
  return (
    <div className="space-y-4">
      <Section title="Identification" icon={<Building2 size={14} />}>
        <Field label="Référence">{bien.reference}</Field>
        <Field label="Type">{TYPE_LABELS[bien.type]}</Field>
        <Field label="Usage">{USAGE_LABELS[bien.usage]}</Field>
        <Field label="Année construction">{bien.annee_construction ?? '—'}</Field>
        <Field label="Surface">{formatSurface(bien.surface)}</Field>
        <Field label="Pièces">{bien.pieces ?? '—'}</Field>
        <Field label="Chambres">{bien.chambres ?? '—'}</Field>
        <Field label="Salles de bain">{bien.salles_bain ?? '—'}</Field>
        <Field label="Étage">{bien.etage ?? '—'}</Field>
      </Section>

      <Section title="Adresse" icon={<MapPin size={14} />}>
        <Field label="Adresse">
          {[bien.adresse_ligne1, bien.adresse_ligne2].filter(Boolean).join(' — ') || '—'}
        </Field>
        <Field label="Ville / Commune">
          {[bien.commune, bien.ville].filter(Boolean).join(', ') || '—'}
        </Field>
        <Field label="Pays">{bien.pays}</Field>
        {bien.latitude !== null && bien.longitude !== null ? (
          <Field label="Coordonnées">
            <span className="font-mono text-xs">
              {Number(bien.latitude).toFixed(5)}, {Number(bien.longitude).toFixed(5)}
            </span>
          </Field>
        ) : null}
      </Section>

      <Section title="Description">
        <p className="col-span-2 text-sm text-neutral-700">
          {bien.description?.trim() ? bien.description : <span className="text-neutral-400">Aucune description.</span>}
        </p>
      </Section>

      {bien.amenities.length > 0 ? (
        <Section title="Équipements">
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {bien.amenities.map((a) => (
              <Badge key={a} variant="info">
                {labelAmenity(a)}
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}

      {bien.tags.length > 0 ? (
        <Section title="Tags">
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {bien.tags.map((t) => (
              <Badge key={t} variant="default">
                {t}
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Métadonnées" icon={<Calendar size={14} />}>
        <Field label="Créé le">{new Date(bien.created_at).toLocaleString('fr-FR')}</Field>
        <Field label="Dernière mise à jour">{new Date(bien.updated_at).toLocaleString('fr-FR')}</Field>
        {bien.archived_at ? (
          <Field label="Archivé le">{new Date(bien.archived_at).toLocaleString('fr-FR')}</Field>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        {icon} {title}
      </h3>
      <dl className="grid gap-2 sm:grid-cols-2">{children}</dl>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  );
}
