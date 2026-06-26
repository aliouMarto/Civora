'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';

import { useCreateImportUpload } from '@/lib/api/contacts.api';
import { useToast } from '@/components/ui/toast';

interface StepUploadProps {
  onUploaded: (fileKey: string, fileName: string) => void;
}

const MAX_BYTES = 50 * 1024 * 1024;

export function StepUpload({ onUploaded }: StepUploadProps): React.ReactElement {
  const create = useCreateImportUpload();
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);

  const onDrop = React.useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast({ title: 'Fichier trop volumineux', description: 'Maximum 50 Mo.', variant: 'error' });
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        toast({ title: 'Format non supporté', description: 'CSV ou XLSX uniquement.', variant: 'error' });
        return;
      }

      setUploading(true);
      try {
        const signed = await create.mutateAsync({
          ext,
          contentType: file.type || (ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
          sizeBytes: file.size,
        });
        const put = await fetch(signed.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'text/csv' },
        });
        if (!put.ok) throw new Error(`Upload R2 échoué : ${put.status}`);
        onUploaded(signed.file_key, file.name);
      } catch (err) {
        toast({ title: 'Échec upload', description: (err as Error).message, variant: 'error' });
      } finally {
        setUploading(false);
      }
    },
    [create, onUploaded, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
        isDragActive
          ? 'border-primary-500 bg-primary-50'
          : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-neutral-50'
      } ${uploading ? 'opacity-60' : 'cursor-pointer'}`}
    >
      <input {...getInputProps()} aria-label="Fichier à importer" />
      {uploading ? (
        <Loader2 size={36} className="animate-spin text-primary-500" />
      ) : (
        <UploadCloud size={36} className="text-neutral-400" />
      )}
      <div>
        <p className="text-sm font-medium text-neutral-800">
          {uploading ? 'Téléversement en cours…' : 'Glissez un fichier ici ou cliquez pour parcourir'}
        </p>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-neutral-500">
          <FileText size={12} /> CSV ou XLSX · 50 Mo max · UTF-8 recommandé
        </p>
      </div>
    </div>
  );
}
