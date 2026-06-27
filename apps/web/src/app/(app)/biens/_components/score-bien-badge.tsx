import * as React from 'react';

interface ScoreBienBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

/**
 * Badge score IA pour Biens (différent de ScoreBadge Contacts — paliers
 * 0-100 mais on affiche la valeur numérique + la lettre).
 */
export function ScoreBienBadge({
  score,
  size = 'sm',
  ariaLabel,
}: ScoreBienBadgeProps): React.ReactElement {
  if (score === null || score === undefined) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200"
        aria-label="Score non calculé"
      >
        —
      </span>
    );
  }

  const grade = gradeFromValue(score);
  const cls = colorClassFromValue(score);
  const sz =
    size === 'lg'
      ? 'px-3 py-1 text-base font-semibold'
      : size === 'md'
        ? 'px-2.5 py-0.5 text-sm font-semibold'
        : 'px-2 py-0.5 text-xs font-medium';

  return (
    <span
      data-grade={grade}
      className={`inline-flex items-center gap-1 rounded-full ${cls} ${sz}`}
      aria-label={ariaLabel ?? `Score IA ${score}/100 (${grade})`}
    >
      <span>{score}</span>
      <span className="opacity-70">·</span>
      <span>{grade}</span>
    </span>
  );
}

function gradeFromValue(v: number): string {
  if (v >= 95) return 'A+';
  if (v >= 85) return 'A';
  if (v >= 75) return 'B+';
  if (v >= 65) return 'B';
  if (v >= 55) return 'C';
  return 'D';
}

function colorClassFromValue(v: number): string {
  if (v >= 85) return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (v >= 65) return 'bg-lime-50 text-lime-700 ring-1 ring-lime-200';
  if (v >= 55) return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200';
}
