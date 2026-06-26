'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ImportWizard } from '../_components/import-wizard';

export default function ImportContactsPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Importer des contacts</h1>
        <p className="text-sm text-neutral-500">
          CSV ou XLSX, 50 Mo max. Le mapping est suggéré automatiquement et reste modifiable.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
