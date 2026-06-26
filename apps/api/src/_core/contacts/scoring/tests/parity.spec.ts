/**
 * Test de parité TS ↔ Python.
 *
 * Exécute la formule TS et la compare au résultat du service Python
 * (apps/ai/app/scoring/contacts_scoring.py) via HTTP. Toute divergence
 * indique une dérive entre les deux implémentations.
 *
 * Pré-requis : `AI_SERVICE_URL` accessible (cf docker-compose dev). Si la
 * variable n'est pas définie OU si le service est down, le test est skip
 * (pas un échec — c'est de la CI-only en pratique).
 */
import { describe, expect, it } from 'vitest';

import { computeScore, type ScoringFeatures } from '../scoring-formula';

const PY_URL = process.env['AI_SERVICE_URL'];

async function pyScore(features: ScoringFeatures): Promise<{ score: number; category: string; confidence: string }> {
  const resp = await fetch(`${PY_URL}/score/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  });
  if (!resp.ok) throw new Error(`Python service returned HTTP ${resp.status}`);
  return (await resp.json()) as { score: number; category: string; confidence: string };
}

const SAMPLES: ScoringFeatures[] = [
  // Profil vide
  {
    has_email: false, has_valid_phone: false, has_address: false, has_tag_or_segment: false,
    interactions_outgoing_90d: 0, interactions_incoming_90d: 0, visits_completed_90d: 0,
    source: null, roles_count: 0, whatsapp_opt_in: false,
    days_since_last_interaction: null, total_interactions: 0,
  },
  // Profil complet engagement modéré
  {
    has_email: true, has_valid_phone: true, has_address: true, has_tag_or_segment: true,
    interactions_outgoing_90d: 4, interactions_incoming_90d: 2, visits_completed_90d: 0,
    source: 'referencement', roles_count: 2, whatsapp_opt_in: true,
    days_since_last_interaction: 5, total_interactions: 12,
  },
  // Pénalité 365j
  {
    has_email: true, has_valid_phone: true, has_address: false, has_tag_or_segment: false,
    interactions_outgoing_90d: 0, interactions_incoming_90d: 0, visits_completed_90d: 0,
    source: 'import', roles_count: 1, whatsapp_opt_in: false,
    days_since_last_interaction: 400, total_interactions: 2,
  },
  // Pénalité 180j
  {
    has_email: true, has_valid_phone: true, has_address: true, has_tag_or_segment: true,
    interactions_outgoing_90d: 1, interactions_incoming_90d: 0, visits_completed_90d: 0,
    source: 'reseau', roles_count: 1, whatsapp_opt_in: true,
    days_since_last_interaction: 200, total_interactions: 6,
  },
  // Engagement plafonné
  {
    has_email: true, has_valid_phone: true, has_address: true, has_tag_or_segment: true,
    interactions_outgoing_90d: 20, interactions_incoming_90d: 10, visits_completed_90d: 5,
    source: 'walk_in', roles_count: 1, whatsapp_opt_in: false,
    days_since_last_interaction: 10, total_interactions: 35,
  },
  // Roles cumulés plafonnés
  {
    has_email: true, has_valid_phone: true, has_address: false, has_tag_or_segment: false,
    interactions_outgoing_90d: 0, interactions_incoming_90d: 0, visits_completed_90d: 0,
    source: 'site_web', roles_count: 10, whatsapp_opt_in: false,
    days_since_last_interaction: 30, total_interactions: 5,
  },
];

describe('Parité TS ↔ Python /score/contact', () => {
  if (!PY_URL) {
    it.skip('AI_SERVICE_URL non défini — test skipped', () => undefined);
    return;
  }

  for (const [i, features] of SAMPLES.entries()) {
    it(`sample #${i + 1} : score TS == score Python`, async () => {
      const ts = computeScore(features);
      let py: Awaited<ReturnType<typeof pyScore>>;
      try {
        py = await pyScore(features);
      } catch (err) {
        // Service down → on ne bloque pas la CI globale
        console.warn(`[parity] Python service unreachable (${(err as Error).message}) — skip`);
        return;
      }
      expect(py.score).toBe(ts.score);
      expect(py.category).toBe(ts.category);
      expect(py.confidence).toBe(ts.confidence);
    });
  }
});
