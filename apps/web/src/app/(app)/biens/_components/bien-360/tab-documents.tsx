'use client';

import * as React from 'react';
import { FolderOpen } from 'lucide-react';

import { Card } from '@/components/ui/card';

export function TabDocuments(): React.ReactElement {
  return (
    <Card className="p-8 text-center">
      <FolderOpen size={36} className="mx-auto text-neutral-300" />
      <p className="mt-2 text-sm font-medium text-neutral-700">
        Module Documents arrive juste après
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Les pièces (mandat de gestion, titre foncier, état des lieux, attestations…)
        seront listées ici dès la livraison du module GED.
      </p>
    </Card>
  );
}
