import type { ContactScoreCategorie } from '@civora/shared-types';

export type ScoreVariant = 'cold' | 'warm' | 'hot' | 'unknown';

/**
 * Mappe un score [0;100] vers une variante visuelle.
 *  - cold  : score < 40 (rouge)
 *  - warm  : 40 ≤ score < 70 (orange)
 *  - hot   : score ≥ 70 (vert)
 *  - unknown : score null
 */
export function scoreVariant(score: number | null | undefined): ScoreVariant {
  if (score === null || score === undefined) return 'unknown';
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function scoreVariantFromCategory(cat: ContactScoreCategorie | null | undefined): ScoreVariant {
  switch (cat) {
    case 'chaud':
      return 'hot';
    case 'tiede':
      return 'warm';
    case 'froid':
      return 'cold';
    default:
      return 'unknown';
  }
}

/** Classes Tailwind pour les badges score. */
export const SCORE_BADGE_CLASSES: Record<ScoreVariant, string> = {
  cold: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  warm: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  hot: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  unknown: 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200',
};

/** Couleur de la jauge (fiche 360°). */
export const SCORE_BAR_CLASSES: Record<ScoreVariant, string> = {
  cold: 'bg-red-500',
  warm: 'bg-orange-500',
  hot: 'bg-emerald-500',
  unknown: 'bg-neutral-300',
};

export function categoryLabel(cat: ContactScoreCategorie | null | undefined): string {
  switch (cat) {
    case 'chaud':
      return 'Chaud';
    case 'tiede':
      return 'Tiède';
    case 'froid':
      return 'Froid';
    default:
      return 'Inconnu';
  }
}
