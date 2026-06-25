import * as React from 'react';
import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PlaceholderPageProps {
  title: string;
  release: string;
  description?: string;
}

export function PlaceholderPage({ title, release, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        <Badge variant="info">{release}</Badge>
      </div>
      <div className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-neutral-200 bg-white text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
          <Construction size={24} />
        </div>
        <div>
          <p className="text-base font-semibold text-neutral-700">
            Ce module sera disponible en {release}
          </p>
          {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
        </div>
      </div>
    </div>
  );
}
