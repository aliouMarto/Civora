'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CheckDuplicatesResponse } from '@/lib/api/contacts.api';

interface DedupDialogProps {
  open: boolean;
  onClose: () => void;
  matches: CheckDuplicatesResponse['matches'];
  /** Callback : l'utilisateur veut quand même créer le contact. */
  onContinue: () => void;
}

export function DedupDialog({ open, onClose, matches, onContinue }: DedupDialogProps): React.ReactElement {
  const hardConflict = matches.some((m) => m.matched_on.includes('email') || m.matched_on.includes('telephone'));

  return (
    <Dialog open={open} onClose={onClose} title="Doublons potentiels détectés">
      <div className="space-y-4 p-4">
        <div className="flex gap-2 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-neutral-700">
            {hardConflict
              ? "Un contact avec le même email ou numéro existe déjà dans cette agence. La création serait refusée par le serveur."
              : "Des contacts similaires existent dans cette agence (nom proche). Vérifiez avant de continuer."}
          </p>
        </div>

        <ul className="space-y-2">
          {matches.slice(0, 5).map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/contacts/${m.id}`}
                    className="font-medium text-neutral-900 hover:text-primary-600"
                  >
                    {m.nom}{m.prenom ? ` ${m.prenom}` : ''}
                  </Link>
                  {m.archived ? <Badge variant="default">Archivé</Badge> : null}
                  {m.matched_on.includes('email') ? <Badge variant="warning">Email identique</Badge> : null}
                  {m.matched_on.includes('telephone') ? <Badge variant="warning">Téléphone identique</Badge> : null}
                  {m.matched_on.includes('nom_similaire') ? <Badge variant="info">Nom similaire</Badge> : null}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {m.email ?? '—'} · {m.telephone ?? '—'}
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/contacts/${m.id}`}>Ouvrir</Link>
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant={hardConflict ? 'danger' : 'primary'} onClick={onContinue} disabled={hardConflict}>
            {hardConflict ? 'Bloqué côté serveur' : 'Continuer quand même'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
