'use client';

import * as React from 'react';
import { List, Map as MapIcon, LayoutGrid } from 'lucide-react';

export type BiensView = 'list' | 'grid' | 'map';

interface BiensToggleViewProps {
  value: BiensView;
  onChange: (v: BiensView) => void;
}

export function BiensToggleView({ value, onChange }: BiensToggleViewProps): React.ReactElement {
  return (
    <div
      role="group"
      aria-label="Bascule de vue"
      className="inline-flex items-center rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm"
    >
      <Btn label="Liste" icon={<List size={14} />} active={value === 'list'} onClick={() => onChange('list')} />
      <Btn label="Grille" icon={<LayoutGrid size={14} />} active={value === 'grid'} onClick={() => onChange('grid')} />
      <Btn label="Carte" icon={<MapIcon size={14} />} active={value === 'map'} onClick={() => onChange('map')} />
    </div>
  );
}

function Btn({
  label, icon, active, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-50 text-primary-700'
          : 'text-neutral-600 hover:bg-neutral-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
