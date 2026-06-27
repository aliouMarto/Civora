'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { Trash2, UploadCloud, Loader2, GripVertical } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  useBienPhotos,
  useDeletePhoto,
  usePhotoUploadUrl,
  useRegisterPhoto,
  useReorderPhotos,
} from '@/lib/api/biens.api';
import type { BienPhotoDto } from '@civora/shared-types';

const MAX_PHOTOS = 20;
const MAX_BYTES = 10 * 1024 * 1024;

export function TabPhotos({ bienId }: { bienId: string }): React.ReactElement {
  const { data: photos = [], isLoading } = useBienPhotos(bienId);
  const [items, setItems] = React.useState<BienPhotoDto[]>([]);
  React.useEffect(() => setItems(photos), [photos]);

  const reorder = useReorderPhotos(bienId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(items, oldIdx, newIdx).map((p, i) => ({ ...p, ordre: i }));
    setItems(next);
    try {
      await reorder.mutateAsync({ order: next.map((p) => ({ id: p.id, ordre: p.ordre })) });
    } catch {
      // restore en cas d'erreur
      setItems(photos);
    }
  };

  return (
    <div className="space-y-4">
      <PhotoUploader bienId={bienId} disabled={items.length >= MAX_PHOTOS} />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Chargement des photos…</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-neutral-500">Aucune photo pour ce bien.</p>
        </Card>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <SortablePhoto key={p.id} photo={p} bienId={bienId} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortablePhoto({ photo, bienId }: { photo: BienPhotoDto; bienId: string }): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const remove = useDeletePhoto(bienId);
  const { toast } = useToast();

  const onRemove = async () => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await remove.mutateAsync(photo.id);
      toast({ title: 'Photo supprimée', variant: 'success' });
    } catch (err) {
      toast({ title: 'Échec suppression', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Réordonner cette photo"
        className="absolute left-2 top-2 z-10 rounded bg-white/90 p-1 text-neutral-500 shadow-sm hover:bg-white"
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        aria-label="Supprimer cette photo"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 rounded bg-white/90 p-1 text-red-500 shadow-sm hover:bg-white"
      >
        <Trash2 size={14} />
      </button>
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={photo.caption ?? 'Photo du bien'}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="aspect-square w-full bg-neutral-100" />
      )}
      {photo.caption ? (
        <p className="truncate p-2 text-xs text-neutral-600">{photo.caption}</p>
      ) : null}
    </div>
  );
}

function PhotoUploader({ bienId, disabled }: { bienId: string; disabled: boolean }): React.ReactElement {
  const uploadUrl = usePhotoUploadUrl(bienId);
  const register = useRegisterPhoto(bienId);
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);

  const upload = async (file: File): Promise<void> => {
    let payload: File = file;
    if (file.size > 2 * 1024 * 1024) {
      try {
        payload = await compressImage(file);
      } catch {
        // garde l'original si la compression rate
        payload = file;
      }
    }
    if (payload.size > MAX_BYTES) {
      throw new Error(`Photo trop volumineuse après compression (max ${MAX_BYTES / 1024 / 1024} Mo)`);
    }
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const signed = await uploadUrl.mutateAsync({
      ext,
      contentType: file.type || 'image/jpeg',
      sizeBytes: payload.size,
    });
    const put = await fetch(signed.upload_url, {
      method: 'PUT',
      body: payload,
      headers: { 'Content-Type': file.type || 'image/jpeg' },
    });
    if (!put.ok) throw new Error(`Upload R2 échoué : ${put.status}`);
    await register.mutateAsync({ storage_key: signed.storage_key });
  };

  const onDrop = async (files: File[]) => {
    if (disabled) return;
    setUploading(true);
    try {
      for (const f of files) {
        try {
          await upload(f);
        } catch (err) {
          toast({ title: `Erreur ${f.name}`, description: (err as Error).message, variant: 'error' });
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] },
    maxFiles: 5,
    disabled: disabled || uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        isDragActive
          ? 'border-primary-500 bg-primary-50'
          : disabled
            ? 'border-neutral-200 bg-neutral-50/50 opacity-60'
            : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-neutral-50'
      }`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <Loader2 size={24} className="animate-spin text-primary-500" />
      ) : (
        <UploadCloud size={24} className="text-neutral-400" />
      )}
      <div>
        <p className="text-sm font-medium text-neutral-800">
          {disabled
            ? `Limite atteinte (${MAX_PHOTOS} photos max)`
            : 'Glissez des photos ici ou cliquez pour parcourir'}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">JPG, PNG, WebP · max 10 Mo après compression</p>
      </div>
    </div>
  );
}

/**
 * Compresse une image > 2 Mo en JPEG q=85 via canvas. Reste fidèle à la
 * taille originale (pas de redimensionnement).
 */
async function compressImage(file: File): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image invalide'));
    i.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, 0, 0);

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Compression impossible'));
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.85,
    );
  });
}
