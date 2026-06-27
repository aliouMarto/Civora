'use client';

import * as React from 'react';

import { BiensMap } from './_components/biens-map';
import { BiensToggleView, type BiensView } from './_components/biens-toggle-view';

/**
 * Page biens — V1 carte uniquement.
 *
 * L'étape 4 du module (frontend complet) ajoutera la vue Liste + Grille +
 * fiche 360°. À ce stade, on expose la carte et la bascule de vue,
 * conformément au spec étape 3 ("Mapbox map + IA portefeuille").
 */
export default function BiensPage(): React.ReactElement {
  const [view, setView] = React.useState<BiensView>('map');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Biens immobiliers</h1>
          <p className="text-sm text-neutral-500">
            Vue carte du parc — bascule liste/grille à l'étape suivante du module.
          </p>
        </div>
        <BiensToggleView value={view} onChange={setView} />
      </div>

      {view === 'map' ? (
        <BiensMap />
      ) : (
        <div className="rounded-lg border-2 border-dashed border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-neutral-700">
            Vue {view === 'list' ? 'liste' : 'grille'} en cours de construction (étape 4 du module).
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            En attendant, bascule vers la carte pour voir les biens géolocalisés.
          </p>
        </div>
      )}
    </div>
  );
}
