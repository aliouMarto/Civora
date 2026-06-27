import * as React from 'react';

import { STATUT_COLORS, STATUT_LABELS } from '@/lib/biens/labels';
import type { BienStatut } from '@civora/shared-types';

interface StatutBadgeProps {
  statut: BienStatut;
  size?: 'sm' | 'md';
}

export function StatutBadge({ statut, size = 'sm' }: StatutBadgeProps): React.ReactElement {
  const cls = STATUT_COLORS[statut];
  const sz = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${cls} ${sz}`}
      aria-label={`Statut : ${STATUT_LABELS[statut]}`}
    >
      {STATUT_LABELS[statut]}
    </span>
  );
}
