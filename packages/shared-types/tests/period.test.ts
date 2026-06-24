import { describe, it, expect } from 'vitest';

import {
  PeriodSchema,
  periodContains,
  periodDurationDays,
  periodOverlaps,
} from '../src/period';

const d = (s: string): Date => new Date(s);

describe('Period', () => {
  it('valide une période correcte', () => {
    const p = PeriodSchema.parse({ start: '2025-01-01', end: '2025-12-31' });
    expect(p.start).toBeInstanceOf(Date);
  });

  it('rejette start > end', () => {
    expect(() => PeriodSchema.parse({ start: '2025-12-31', end: '2025-01-01' })).toThrow();
  });

  it('accepte start == end (même jour)', () => {
    const p = PeriodSchema.parse({ start: '2025-06-01', end: '2025-06-01' });
    expect(p.start.getTime()).toBe(p.end.getTime());
  });
});

describe('periodOverlaps', () => {
  it('détecte un chevauchement', () => {
    const a = { start: d('2025-01-01'), end: d('2025-06-30') };
    const b = { start: d('2025-06-01'), end: d('2025-12-31') };
    expect(periodOverlaps(a, b)).toBe(true);
  });

  it('retourne true pour des périodes dont les bornes se touchent exactement', () => {
    const same = d('2025-06-01');
    const a = { start: d('2025-01-01'), end: same };
    const b = { start: same, end: d('2025-12-31') };
    expect(periodOverlaps(a, b)).toBe(true); // même instant de borne = overlap
  });

  it('retourne false pour des périodes disjointes', () => {
    const a = { start: d('2025-01-01'), end: d('2025-03-31') };
    const b = { start: d('2025-07-01'), end: d('2025-12-31') };
    expect(periodOverlaps(a, b)).toBe(false);
  });
});

describe('periodContains', () => {
  const period = { start: d('2025-01-01'), end: d('2025-12-31') };

  it('retourne true pour une date dans la période', () => {
    expect(periodContains(period, d('2025-06-15'))).toBe(true);
  });

  it('retourne false pour une date hors période', () => {
    expect(periodContains(period, d('2026-01-01'))).toBe(false);
  });
});

describe('periodDurationDays', () => {
  it('calcule la durée en jours', () => {
    const p = { start: d('2025-01-01'), end: d('2025-01-31') };
    expect(periodDurationDays(p)).toBe(30);
  });
});
