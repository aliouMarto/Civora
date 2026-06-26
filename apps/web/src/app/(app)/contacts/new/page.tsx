'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ContactForm } from '../_components/contact-form';

export default function NewContactPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Nouveau contact</h1>
        <p className="text-sm text-neutral-500">
          Renseignez au moins l'email ou le téléphone. Les doublons seront détectés automatiquement.
        </p>
      </div>
      <ContactForm mode="create" />
    </div>
  );
}
