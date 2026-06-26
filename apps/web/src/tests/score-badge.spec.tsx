import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ScoreBadge } from '@/app/(app)/contacts/_components/score-badge';

describe('ScoreBadge', () => {
  it('affiche un tiret quand score est null', () => {
    render(<ScoreBadge score={null} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'unknown');
    expect(screen.getByRole('status')).toHaveTextContent('–');
  });

  it('score 0 → variant cold (rouge)', () => {
    render(<ScoreBadge score={0} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-variant', 'cold');
    expect(el).toHaveTextContent('0');
  });

  it('score 40 → variant warm (orange)', () => {
    render(<ScoreBadge score={40} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'warm');
  });

  it('score 69 (juste sous le seuil chaud) → variant warm', () => {
    render(<ScoreBadge score={69} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'warm');
  });

  it('score 70 → variant hot (vert)', () => {
    render(<ScoreBadge score={70} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'hot');
  });

  it('score 100 → variant hot', () => {
    render(<ScoreBadge score={100} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'hot');
  });

  it('aria-label par défaut explique le score', () => {
    render(<ScoreBadge score={75} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Score IA 75');
  });

  it('aria-label custom respecté', () => {
    render(<ScoreBadge score={75} ariaLabel="Engagement client" />);
    expect(screen.getByLabelText('Engagement client')).toBeTruthy();
  });
});
