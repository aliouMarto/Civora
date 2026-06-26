'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, Download, ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useImportErrorsUrl, type ImportJobStatus } from '@/lib/api/contacts.api';
import { useToast } from '@/components/ui/toast';

interface StepReportProps {
  job: ImportJobStatus;
  onClose: () => void;
}

export function StepReport({ job, onClose }: StepReportProps): React.ReactElement {
  const errorsUrlMut = useImportErrorsUrl();
  const { toast } = useToast();

  const downloadErrors = async () => {
    try {
      const res = await errorsUrlMut.mutateAsync(job.id);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'error' });
    }
  };

  const isCompleted = job.status === 'completed';

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        {isCompleted ? (
          <CheckCircle2 size={28} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={28} className="text-red-600" />
        )}
        <div>
          <h3 className="text-base font-semibold text-neutral-900">
            {isCompleted ? 'Import terminé' : 'Import échoué'}
          </h3>
          <p className="text-xs text-neutral-500">
            {job.imported} contact(s) importé(s) sur {job.total_rows}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={job.total_rows} />
        <Stat label="Importés" value={job.imported} variant="success" />
        <Stat label="Ignorés" value={job.skipped} />
        <Stat label="Erreurs" value={job.errors} variant={job.errors > 0 ? 'danger' : undefined} />
      </div>

      {job.errors > 0 && job.errors_file_key ? (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div>
            <p className="text-sm font-medium text-amber-900">{job.errors} ligne(s) en erreur</p>
            <p className="text-xs text-amber-700">
              Téléchargez le CSV pour comprendre, corriger et relancer un import.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadErrors} loading={errorsUrlMut.isPending}>
            <Download size={14} className="mr-1.5" /> Télécharger
          </Button>
        </div>
      ) : null}

      <div className="flex justify-end border-t border-neutral-100 pt-3">
        <Button onClick={onClose}>
          Voir les contacts <ArrowRight size={14} className="ml-1.5" />
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'success' | 'danger';
}) {
  const colorCls =
    variant === 'success'
      ? 'text-emerald-700'
      : variant === 'danger'
        ? 'text-red-700'
        : 'text-neutral-700';
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 text-center">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${colorCls}`}>{value}</p>
    </div>
  );
}
