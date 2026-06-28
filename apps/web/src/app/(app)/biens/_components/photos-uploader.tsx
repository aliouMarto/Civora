'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useBienPhotos, useDeletePhoto, useRegisterPhoto } from '@/lib/api/biens.api';

interface PhotosUploaderProps {
  bienId: string;
  onPhotoAdded?: () => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; name: string; index: number; total: number }
  | { status: 'error'; message: string };

/**
 * Composant d'upload de photos pour un bien.
 *
 * En dev (pas de bucket R2 configuré), on convertit les fichiers en data URL
 * base64 et on les envoie comme `storage_key`. Le backend accepte ce shortcut
 * et renvoie l'URL telle quelle au listing.
 */
export function PhotosUploader({ bienId, onPhotoAdded }: PhotosUploaderProps): React.ReactElement {
  const { toast } = useToast();
  const photosQuery = useBienPhotos(bienId);
  const registerMut = useRegisterPhoto(bienId);
  const deleteMut = useDeletePhoto(bienId);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [uploadState, setUploadState] = React.useState<UploadState>({ status: 'idle' });

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const valid: File[] = [];
      for (const f of list) {
        if (!ACCEPTED_TYPES.includes(f.type)) {
          toast({
            title: 'Format non supporté',
            description: `${f.name} : seuls JPG, PNG et WEBP sont acceptés.`,
            variant: 'error',
          });
          continue;
        }
        if (f.size > MAX_SIZE_BYTES) {
          toast({
            title: 'Fichier trop volumineux',
            description: `${f.name} dépasse 5 Mo.`,
            variant: 'error',
          });
          continue;
        }
        valid.push(f);
      }

      if (valid.length === 0) return;

      let successCount = 0;
      for (let i = 0; i < valid.length; i++) {
        const file = valid[i];
        setUploadState({ status: 'uploading', name: file.name, index: i + 1, total: valid.length });
        try {
          const dataUrl = await readFileAsDataUrl(file);
          await registerMut.mutateAsync({ storage_key: dataUrl, caption: file.name });
          successCount += 1;
          onPhotoAdded?.();
        } catch (err) {
          toast({
            title: `Échec upload : ${file.name}`,
            description: (err as Error).message,
            variant: 'error',
          });
        }
      }

      setUploadState({ status: 'idle' });
      if (successCount > 0) {
        toast({
          title: `${successCount} photo${successCount > 1 ? 's' : ''} ajoutée${successCount > 1 ? 's' : ''}`,
          variant: 'success',
        });
      }
    },
    [onPhotoAdded, registerMut, toast],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files);
      // Reset pour pouvoir re-uploader le même fichier
      e.target.value = '';
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const onDelete = async (photoId: string) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      await deleteMut.mutateAsync(photoId);
      toast({ title: 'Photo supprimée', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Erreur suppression',
        description: (err as Error).message,
        variant: 'error',
      });
    }
  };

  const photos = photosQuery.data ?? [];
  const isUploading = uploadState.status === 'uploading';

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-2
          rounded-xl border-2 border-dashed
          px-6 py-10 text-center cursor-pointer transition
          ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={onInputChange}
        />
        <svg
          className="h-10 w-10 text-neutral-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5 7.5 12M12 7.5v9"
          />
        </svg>
        <p className="text-sm font-medium text-neutral-700">
          {isUploading
            ? `Envoi ${uploadState.index}/${uploadState.total} : ${uploadState.name}`
            : 'Glissez-déposez vos photos ici, ou cliquez pour choisir'}
        </p>
        <p className="text-xs text-neutral-500">
          JPG, PNG ou WEBP — 5 Mo maximum par fichier
        </p>
      </div>

      {photosQuery.isLoading ? (
        <p className="text-sm text-neutral-500">Chargement des photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune photo pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <Card key={photo.id} className="group relative overflow-hidden p-0">
              <div className="aspect-square bg-neutral-100">
                {photo.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.url}
                    alt={photo.caption ?? 'Photo du bien'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                    Indisponible
                  </div>
                )}
              </div>
              {photo.caption ? (
                <div className="px-2 py-1.5 text-xs text-neutral-600 truncate" title={photo.caption}>
                  {photo.caption}
                </div>
              ) : null}
              <div className="absolute inset-0 flex items-end justify-end bg-black/0 p-2 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete(photo.id);
                  }}
                  loading={deleteMut.isPending && deleteMut.variables === photo.id}
                >
                  Supprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Lecture du fichier échouée'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier échouée'));
    reader.readAsDataURL(file);
  });
}
