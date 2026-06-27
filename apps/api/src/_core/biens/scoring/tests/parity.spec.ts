/**
 * Tests de parité TS ↔ Python.
 *
 * Si le service Python est joignable (AI_SERVICE_URL), on lui envoie les
 * mêmes inputs que la formule TS et on compare les sorties. Sinon, le
 * test est skip proprement (commentaire visible).
 *
 * On vérifie : `global.value`, les 4 sous-scores principaux et leur grade.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { computeBienScore } from '../scoring-formula';
import type { BienMarketContext, BienScoreFeatures } from '@civora/shared-types';

const PY_URL = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000';

async function pyReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${PY_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let available = false;

describe('Parité TS/Python — scoring biens', async () => {
  available = await pyReachable();

  const skipIfDown = available ? it : it.skip;

  const cases: Array<{ name: string; features: BienScoreFeatures; market: BienMarketContext }> = [
    {
      name: 'yield 7%, occupation 75%, renové, marché actif',
      features: { yield_brut_pct: 7, occupation_12m: 75, tags: ['renove'] },
      market: { commune_total: 8, commune_loues: 7, is_unique_type_commune: false },
    },
    {
      name: 'yield 3%, occupation 25%, vetuste, marché faible',
      features: { yield_brut_pct: 3, occupation_12m: 25, tags: ['vetuste'] },
      market: { commune_total: 5, commune_loues: 1, is_unique_type_commune: true },
    },
    {
      name: 'yield 12%, occupation 95%, neuf, marché saturé',
      features: { yield_brut_pct: 12, occupation_12m: 95, tags: ['etat_neuf'] },
      market: { commune_total: 10, commune_loues: 10, is_unique_type_commune: false },
    },
    {
      name: 'aucune donnée, statut disponible',
      features: { statut: 'disponible' },
      market: { commune_total: 0, commune_loues: 0, is_unique_type_commune: true },
    },
  ];

  for (const c of cases) {
    skipIfDown(`parité : ${c.name}`, async () => {
      const ts = computeBienScore(c.features, c.market);

      const res = await fetch(`${PY_URL}/score/bien`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agence_id: '00000000-0000-0000-0000-000000000001',
          bien_id: '00000000-0000-0000-0000-000000000002',
          features: c.features,
          market_context: c.market,
        }),
      });
      expect(res.ok).toBe(true);
      const py = await res.json() as {
        global_: { value: number; grade: string };
        sub_scores: Record<string, { value: number }>;
      };

      expect(py.global_.value).toBe(ts.global.value);
      expect(py.global_.grade).toBe(ts.global.grade);
      expect(py.sub_scores['occupation']?.value).toBe(ts.sub_scores.occupation.value);
      expect(py.sub_scores['rentabilite']?.value).toBe(ts.sub_scores.rentabilite.value);
      expect(py.sub_scores['demande']?.value).toBe(ts.sub_scores.demande.value);
      expect(py.sub_scores['risque']?.value).toBe(ts.sub_scores.risque.value);
    });
  }

  if (!available) {
    it.skip('(skip) Service Python AI inaccessible — `pnpm --filter @civora/ai dev` pour activer les tests de parité', () => undefined);
  }
});

afterAll(() => {
  if (!available) {
    // eslint-disable-next-line no-console
    console.warn('Parité TS/Python skippée : AI_SERVICE_URL non joignable.');
  }
});
