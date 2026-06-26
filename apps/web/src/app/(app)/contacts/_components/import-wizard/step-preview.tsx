'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import type { ImportPreviewResponse } from '@/lib/api/contacts.api';

interface StepPreviewProps {
  preview: ImportPreviewResponse | null;
  isLoading: boolean;
  options: {
    skip_duplicates?: boolean;
    update_duplicates?: boolean;
  };
  onOptionsChange: (next: { skip_duplicates?: boolean; update_duplicates?: boolean }) => void;
  onBack: () => void;
  onLaunch: () => void;
  isLaunching: boolean;
}

export function StepPreview({
  preview,
  isLoading,
  options,
  onOptionsChange,
  onBack,
  onLaunch,
  isLaunching,
}: StepPreviewProps): React.ReactElement {
  if (isLoading || !preview) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <Loader2 size={20} className="animate-spin text-primary-500" />
        <p className="text-sm text-neutral-600">Analyse du fichier en cours…</p>
      </Card>
    );
  }

  const allOk = preview.preview_rows.every((r) => r.errors.length === 0);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-800">Aperçu (5 premières lignes)</h3>
        <p className="text-xs text-neutral-500">
          Total estimé : <strong>{preview.total_rows_estimated}</strong> ligne(s).
          {allOk ? ' Tous les échantillons sont valides.' : ' Certaines lignes contiennent des erreurs.'}
        </p>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Ligne</TableHeader>
            <TableHeader>Nom</TableHeader>
            <TableHeader>Email</TableHeader>
            <TableHeader>Téléphone</TableHeader>
            <TableHeader>Validation</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {preview.preview_rows.map((r) => (
            <TableRow key={r.row}>
              <TableCell className="text-xs text-neutral-500">{r.row}</TableCell>
              <TableCell>{(r.data['nom'] as string) ?? '—'}</TableCell>
              <TableCell>{(r.data['email'] as string) ?? '—'}</TableCell>
              <TableCell>{(r.data['telephone'] as string) ?? '—'}</TableCell>
              <TableCell>
                {r.errors.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 size={14} /> OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-600" title={r.errors.join(' ; ')}>
                    <AlertCircle size={14} /> {r.errors.length} erreur(s)
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-xs font-medium text-neutral-700">Comportement face aux doublons</p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.skip_duplicates ?? false}
              onChange={(e) =>
                onOptionsChange({
                  ...options,
                  skip_duplicates: e.target.checked,
                  update_duplicates: e.target.checked ? false : options.update_duplicates,
                })
              }
            />
            <Label className="!font-normal">Ignorer les doublons (skip)</Label>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.update_duplicates ?? false}
              onChange={(e) =>
                onOptionsChange({
                  ...options,
                  update_duplicates: e.target.checked,
                  skip_duplicates: e.target.checked ? false : options.skip_duplicates,
                })
              }
            />
            <Label className="!font-normal">Mettre à jour les doublons</Label>
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Par défaut, les doublons sont reportés comme erreurs dans le rapport final.
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" /> Modifier le mapping
        </Button>
        <Button onClick={onLaunch} loading={isLaunching}>
          Lancer l'import ({preview.total_rows_estimated} lignes){' '}
          <ArrowRight size={14} className="ml-1.5" />
        </Button>
      </div>
    </Card>
  );
}
