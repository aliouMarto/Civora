'use client';

import * as React from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { useAuthStore } from '@/lib/store/auth.store';
import { useImportStatus, type ImportJobStatus } from '@/lib/api/contacts.api';

interface StepExecuteProps {
  importJobId: string;
  onCompleted: (job: ImportJobStatus) => void;
}

interface ProgressEvent {
  import_job_id: string;
  processed: number;
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  percent: number;
  status: 'running' | 'completed';
}

export function StepExecute({ importJobId, onCompleted }: StepExecuteProps): React.ReactElement {
  const { data: job } = useImportStatus(importJobId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [livePct, setLivePct] = React.useState<number | null>(null);
  useRealtime<ProgressEvent>(accessToken, 'contacts.import.progress', (event) => {
    if (event.import_job_id !== importJobId) return;
    setLivePct(event.percent);
  });

  // Fallback : si websocket pas reçu, calcule à partir du polling
  const pct =
    livePct ??
    (job && job.total_rows > 0 ? Math.round((job.processed / job.total_rows) * 100) : 0);

  React.useEffect(() => {
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      onCompleted(job);
    }
  }, [job, onCompleted]);

  if (!job) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <Loader2 size={20} className="animate-spin text-primary-500" />
        <p className="text-sm text-neutral-600">Initialisation de l'import…</p>
        <Skeleton className="h-2 w-64" />
      </Card>
    );
  }

  const isDone = job.status === 'completed';
  const isFailed = job.status === 'failed';

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 size={24} className="text-emerald-600" />
        ) : isFailed ? (
          <AlertTriangle size={24} className="text-red-600" />
        ) : (
          <Loader2 size={24} className="animate-spin text-primary-500" />
        )}
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">
            {isDone ? 'Import terminé' : isFailed ? 'Import échoué' : `Import en cours… ${pct}%`}
          </h3>
          <p className="text-xs text-neutral-500">
            {job.processed} / {job.total_rows} ligne(s) traitée(s)
          </p>
        </div>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full transition-all ${isFailed ? 'bg-red-500' : 'bg-primary-500'}`}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Importés" value={job.imported} className="text-emerald-700" />
        <Stat label="Ignorés (doublons)" value={job.skipped} className="text-neutral-700" />
        <Stat label="Erreurs" value={job.errors} className="text-red-700" />
      </div>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 text-center">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${className}`}>{value}</p>
    </div>
  );
}
