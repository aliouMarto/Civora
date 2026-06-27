'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { BienForm } from '../_components/bien-form';

export default function NewBienPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link
          href="/biens"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Nouveau bien</h1>
        <p className="text-sm text-neutral-500">
          La référence sera générée automatiquement (BIE-YYYY-NNNN) si vous ne la
          fournissez pas.
        </p>
      </div>
      <BienForm mode="create" />
    </div>
  );
}
