import * as React from 'react';

import {
  SCORE_BADGE_CLASSES,
  scoreVariant,
  type ScoreVariant,
} from '@/lib/contacts/score-colors';

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

/**
 * Badge couleur 0-100. Affiche un tiret si score absent.
 */
export function ScoreBadge({ score, size = 'sm', ariaLabel }: ScoreBadgeProps): React.ReactElement {
  const variant: ScoreVariant = scoreVariant(score);
  const text = score === null || score === undefined ? '–' : String(score);

  const sizeCls =
    size === 'lg'
      ? 'px-3 py-1 text-base font-semibold'
      : size === 'md'
        ? 'px-2.5 py-0.5 text-sm font-semibold'
        : 'px-2 py-0.5 text-xs font-medium';

  return (
    <span
      role="status"
      aria-label={ariaLabel ?? `Score IA ${text}`}
      data-variant={variant}
      className={`inline-flex items-center rounded-full ${SCORE_BADGE_CLASSES[variant]} ${sizeCls}`}
    >
      {text}
    </span>
  );
}
