/**
 * Tests de l'heuristique de scoring biens (8 cas couvrant les paliers).
 *
 * La parité TS/Python est validée via tests/parity.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { computeBienScore, computeYieldBrutPct } from '../scoring-formula';
import type { BienMarketContext, BienScoreFeatures } from '@civora/shared-types';

const EMPTY_MARKET: BienMarketContext = {
  commune_total: 10,
  commune_loues: 5,
  is_unique_type_commune: false,
};

describe('scoring-formula — paliers individuels', () => {
  it('yield faible (3%) → rentabilite C (30)', () => {
    const r = computeBienScore({ yield_brut_pct: 3 }, EMPTY_MARKET);
    expect(r.sub_scores.rentabilite.value).toBe(30);
    expect(r.sub_scores.rentabilite.confidence).toBe('high');
  });

  it('yield moyen (7%) → rentabilite B (70)', () => {
    const r = computeBienScore({ yield_brut_pct: 7 }, EMPTY_MARKET);
    expect(r.sub_scores.rentabilite.value).toBe(70);
  });

  it('yield fort (11%) → rentabilite A+ (100)', () => {
    const r = computeBienScore({ yield_brut_pct: 11 }, EMPTY_MARKET);
    expect(r.sub_scores.rentabilite.value).toBe(100);
  });

  it('occupation 95% → 100, occupation 25% → 20', () => {
    const high = computeBienScore({ occupation_12m: 95 }, EMPTY_MARKET);
    const low = computeBienScore({ occupation_12m: 25 }, EMPTY_MARKET);
    expect(high.sub_scores.occupation.value).toBe(100);
    expect(low.sub_scores.occupation.value).toBe(20);
  });

  it('sans occupation_12m, fallback statut loué = 80, hors_circuit = 0', () => {
    const loue = computeBienScore({ statut: 'loue' }, EMPTY_MARKET);
    const hc = computeBienScore({ statut: 'hors_circuit' }, EMPTY_MARKET);
    expect(loue.sub_scores.occupation.value).toBe(80);
    expect(loue.sub_scores.occupation.confidence).toBe('low');
    expect(hc.sub_scores.occupation.value).toBe(0);
  });

  it('état "renove" donne 85 (A) ; absence donne 60 confidence low', () => {
    const renove = computeBienScore({ tags: ['renove'] }, EMPTY_MARKET);
    const inconnu = computeBienScore({ tags: [] }, EMPTY_MARKET);
    expect(renove.sub_scores.etat.value).toBe(85);
    expect(inconnu.sub_scores.etat.value).toBe(60);
    expect(inconnu.sub_scores.etat.confidence).toBe('low');
  });

  it('demande commune > 80% loués → demande = 100', () => {
    const r = computeBienScore({}, { commune_total: 10, commune_loues: 9, is_unique_type_commune: false });
    expect(r.sub_scores.demande.value).toBe(100);
  });

  it('bien seul de son type+commune → pénalité -20 sur risque', () => {
    const solo = computeBienScore({}, { ...EMPTY_MARKET, is_unique_type_commune: true });
    const partage = computeBienScore({}, { ...EMPTY_MARKET, is_unique_type_commune: false });
    expect(solo.sub_scores.risque.value).toBeLessThan(partage.sub_scores.risque.value);
  });

  it('global = combinaison pondérée des 4 sous-scores', () => {
    const features: BienScoreFeatures = {
      yield_brut_pct: 8,         // → 85 (rentabilite)
      occupation_12m: 75,        // → 80 (occupation)
      tags: ['renove'],
    };
    const market: BienMarketContext = { commune_total: 8, commune_loues: 7, is_unique_type_commune: false };
    const r = computeBienScore(features, market);
    // 0.3*80 + 0.3*85 + 0.2*100 + 0.2*70 = 24 + 25.5 + 20 + 14 = 83.5 → 84
    expect(r.global.value).toBeGreaterThanOrEqual(80);
    expect(r.global.value).toBeLessThanOrEqual(85);
    expect(r.global.grade).toMatch(/^(B\+|A)$/);
  });

  it('confidence = low si au moins un sous-score est low', () => {
    const r = computeBienScore({ yield_brut_pct: 7 /* high */ }, EMPTY_MARKET);
    // demande_commune total=10 → confidence high, mais risque par défaut = low.
    expect(r.global.confidence).toBe('low');
  });
});

describe('computeYieldBrutPct', () => {
  it('calcule loyer×12/prix×100', () => {
    // loyer = 100_000 FCFA/mois → 1_200_000/an
    // prix = 60_000_000 FCFA → yield = 2 %
    expect(computeYieldBrutPct(100_000n * 100n, 60_000_000n * 100n)).toBe(2);
  });

  it('renvoie null si données manquantes', () => {
    expect(computeYieldBrutPct(null, 1000n)).toBeNull();
    expect(computeYieldBrutPct(1000n, null)).toBeNull();
    expect(computeYieldBrutPct(0n, 1000n)).toBe(0);
    expect(computeYieldBrutPct(1000n, 0n)).toBeNull();
  });
});
