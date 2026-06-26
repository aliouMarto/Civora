'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useImportExecute, useImportPreview, type ImportJobStatus, type ImportPreviewResponse } from '@/lib/api/contacts.api';
import { useToast } from '@/components/ui/toast';

import { StepUpload } from './step-upload';
import { StepMapping } from './step-mapping';
import { StepPreview } from './step-preview';
import { StepExecute } from './step-execute';
import { StepReport } from './step-report';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'execute' | 'report';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'upload', label: '1. Fichier' },
  { id: 'mapping', label: '2. Mapping' },
  { id: 'preview', label: '3. Aperçu' },
  { id: 'execute', label: '4. Exécution' },
  { id: 'report', label: '5. Rapport' },
];

export function ImportWizard(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<WizardStep>('upload');
  const [fileKey, setFileKey] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [options, setOptions] = React.useState<{ skip_duplicates?: boolean; update_duplicates?: boolean }>({
    skip_duplicates: true,
  });
  const [importJobId, setImportJobId] = React.useState<string | null>(null);
  const [finalJob, setFinalJob] = React.useState<ImportJobStatus | null>(null);

  const previewMut = useImportPreview();
  const executeMut = useImportExecute();

  // Step 1 → 2
  const onUploaded = async (key: string, name: string) => {
    setFileKey(key);
    setFileName(name);
    try {
      const res = await previewMut.mutateAsync({ file_key: key });
      setPreview(res);
      setMapping(res.suggested_mapping);
      setStep('mapping');
    } catch (err) {
      toast({ title: 'Échec analyse', description: (err as Error).message, variant: 'error' });
    }
  };

  // Step 2 → 3
  const refreshPreview = async () => {
    if (!fileKey) return;
    try {
      const res = await previewMut.mutateAsync({ file_key: fileKey, mapping });
      setPreview(res);
      setStep('preview');
    } catch (err) {
      toast({ title: 'Échec aperçu', description: (err as Error).message, variant: 'error' });
    }
  };

  // Step 3 → 4
  const launch = async () => {
    if (!fileKey) return;
    try {
      const res = await executeMut.mutateAsync({
        file_key: fileKey,
        mapping,
        options,
      });
      setImportJobId(res.import_job_id);
      setStep('execute');
    } catch (err) {
      toast({ title: 'Échec lancement', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {fileName ? (
        <p className="text-xs text-neutral-500">
          Fichier en cours : <strong>{fileName}</strong>
        </p>
      ) : null}

      {step === 'upload' && <StepUpload onUploaded={onUploaded} />}

      {step === 'mapping' && preview && (
        <StepMapping
          headers={preview.headers}
          suggested={preview.suggested_mapping}
          value={mapping}
          onChange={setMapping}
          onContinue={refreshPreview}
          onResetSuggested={() => setMapping(preview.suggested_mapping)}
        />
      )}

      {step === 'preview' && (
        <StepPreview
          preview={preview}
          isLoading={previewMut.isPending}
          options={options}
          onOptionsChange={setOptions}
          onBack={() => setStep('mapping')}
          onLaunch={launch}
          isLaunching={executeMut.isPending}
        />
      )}

      {step === 'execute' && importJobId && (
        <StepExecute
          importJobId={importJobId}
          onCompleted={(job) => {
            setFinalJob(job);
            setStep('report');
          }}
        />
      )}

      {step === 'report' && finalJob && (
        <StepReport job={finalJob} onClose={() => router.push('/contacts')} />
      )}
    </div>
  );
}

function Stepper({ current }: { current: WizardStep }): React.ReactElement {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-3 text-xs">
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li
            key={s.id}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 font-medium ${
              active
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : done
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-neutral-200 bg-white text-neutral-500'
            }`}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
