'use client';

import * as React from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth.store';
import type { ContactFiltersInput } from '@/lib/api/contacts.api';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  filtres: ContactFiltersInput;
  /** Si fourni, l'export se limite aux IDs sélectionnés (priorité sur filtres). */
  selectedIds?: string[];
}

export function ExportDialog({ open, onClose, filtres, selectedIds }: ExportDialogProps): React.ReactElement {
  const [format, setFormat] = React.useState<'csv' | 'xlsx'>('csv');
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const accessToken = useAuthStore((s) => s.accessToken);

  const submit = async () => {
    setPending(true);
    try {
      // POST direct (le serveur peut renvoyer un fichier OU un JSON {mode:'async', export_job_id})
      const url = '/contacts/export';
      const body = JSON.stringify({
        format,
        filtres: selectedIds && selectedIds.length > 0 ? { ids: selectedIds } : filtres,
      });

      // On utilise fetch nu pour pouvoir streamer un attachment binaire.
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const res = await fetch(`${baseUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        body,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} : ${await res.text()}`);

      const ctype = res.headers.get('content-type') ?? '';
      if (ctype.includes('application/json')) {
        // Mode async
        const data = (await res.json()) as { export_job_id: string; mode: 'async' };
        toast({
          title: 'Export en préparation',
          description: `Tâche ${data.export_job_id.slice(0, 8)}… vous serez notifié quand le fichier sera prêt.`,
          variant: 'default',
        });
        onClose();
        return;
      }

      // Mode sync : binary download
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(dlUrl);
      toast({ title: 'Export téléchargé', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: 'Échec export', description: (err as Error).message, variant: 'error' });
    } finally {
      setPending(false);
    }
  };

  const count = selectedIds?.length ?? 0;

  return (
    <Dialog open={open} onClose={onClose} title="Exporter les contacts">
      <div className="space-y-4 p-4">
        <p className="text-sm text-neutral-600">
          {count > 0
            ? `Exporter ${count} contact(s) sélectionné(s).`
            : 'Exporter la liste avec les filtres actuels.'}
        </p>

        <div>
          <Label>Format de fichier</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${
                format === 'csv'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <FileText size={16} /> CSV (universel)
            </button>
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${
                format === 'xlsx'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <FileSpreadsheet size={16} /> Excel (.xlsx)
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Au-delà de 1000 contacts, l'export est traité en arrière-plan. Vous
          recevrez une notification temps réel quand le fichier sera prêt
          (lien valide 24h).
        </p>

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={pending}>
            {pending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
            Exporter
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

