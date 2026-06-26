'use client';

import * as React from 'react';
import { Building2, FileText, CalendarRange, Banknote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Onglet "Relations immobilières" — placeholders pour les modules
 * Locations (R2), Saisonnier (R4) et Ventes (R3). Les sections
 * apparaîtront vraiment quand ces modules seront livrés.
 */
export function TabRelations(): React.ReactElement {
  const sections = [
    {
      id: 'biens',
      title: 'Biens possédés',
      release: 'R2',
      icon: <Building2 size={14} />,
      empty: 'Aucun bien rattaché. Sera enrichi quand le module Biens sera actif.',
    },
    {
      id: 'baux',
      title: 'Baux',
      release: 'R2',
      icon: <FileText size={14} />,
      empty: 'Aucun bail à ce stade. Sera enrichi quand le module Locations sera actif.',
    },
    {
      id: 'reservations',
      title: 'Réservations',
      release: 'R4',
      icon: <CalendarRange size={14} />,
      empty: 'Aucune réservation. Sera enrichi quand le module Saisonnier sera actif.',
    },
    {
      id: 'ventes',
      title: 'Ventes & offres',
      release: 'R3',
      icon: <Banknote size={14} />,
      empty: 'Aucune vente ou offre. Sera enrichi quand le module Ventes sera actif.',
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              {s.icon} {s.title}
            </h3>
            <Badge variant="info">{s.release}</Badge>
          </div>
          <p className="text-sm italic text-neutral-500">{s.empty}</p>
        </Card>
      ))}
    </div>
  );
}
