'use client';

import * as React from 'react';
import { Mail, Phone, MessageCircle, MapPin, Calendar, User } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ContactDto } from '@civora/shared-types';

import { labelSource } from '@/lib/contacts/source-labels';

export function TabProfile({ contact }: { contact: ContactDto }): React.ReactElement {
  return (
    <div className="space-y-4">
      <Section title="Identité" icon={<User size={14} />}>
        <Field label="Nom complet">
          {contact.nom}{contact.prenom ? ` ${contact.prenom}` : ''}
        </Field>
        <Field label="Genre">{contact.genre ?? '—'}</Field>
        <Field label="Langue">{contact.langue}</Field>
        <Field label="Source">{labelSource(contact.source)}</Field>
        <Field label="Tags">
          {contact.tags.length === 0 ? (
            <span className="text-neutral-400">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => (
                <Badge key={t} variant="default">{t}</Badge>
              ))}
            </div>
          )}
        </Field>
      </Section>

      <Section title="Canaux" icon={<Phone size={14} />}>
        <Field label="Email">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="text-primary-600 hover:underline">
              <Mail size={12} className="mr-1 inline" />
              {contact.email}
            </a>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </Field>
        <Field label="Téléphone">{contact.telephone ?? '—'}</Field>
        <Field label="WhatsApp">
          {contact.whatsapp ? (
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={12} className="text-emerald-600" />
              {contact.whatsapp}
              {contact.whatsapp_opt_in ? (
                <Badge variant="success" className="ml-2">opt-in</Badge>
              ) : (
                <Badge variant="warning" className="ml-2">pas d'opt-in</Badge>
              )}
            </span>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </Field>
      </Section>

      <Section title="Adresse" icon={<MapPin size={14} />}>
        <Field label="Adresse">
          {[contact.adresse_ligne1, contact.adresse_ligne2].filter(Boolean).join(' — ') || '—'}
        </Field>
        <Field label="Ville / Commune">
          {[contact.commune, contact.ville].filter(Boolean).join(', ') || '—'}
        </Field>
        <Field label="Pays">{contact.pays}</Field>
      </Section>

      <Section title="Métadonnées" icon={<Calendar size={14} />}>
        <Field label="Créé le">{new Date(contact.created_at).toLocaleString('fr-FR')}</Field>
        <Field label="Dernière mise à jour">{new Date(contact.updated_at).toLocaleString('fr-FR')}</Field>
        <Field label="Statut">
          {contact.archived_at ? (
            <Badge variant="danger">Archivé le {new Date(contact.archived_at).toLocaleDateString('fr-FR')}</Badge>
          ) : (
            <Badge variant="success">Actif</Badge>
          )}
        </Field>
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
  icon: React.ReactNode;
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
