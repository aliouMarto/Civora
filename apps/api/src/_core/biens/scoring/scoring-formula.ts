/**
 * Formule de scoring portefeuille — implémentation transparente.
 *
 * Cette fonction est PURE : pas d'effet de bord, pas d'I/O. Elle est
 * répliquée à l'identique en Python (apps/ai/app/scoring/biens_scoring.py)
 * pour garantir la parité TS/Python (testée).
 *
 * Référence : docs/scoring/biens.md.
 */
import {
  combineConfidence,
  gradeFromValue,
  type BienMarketContext,
  type BienScoreBreakdown,
  type BienScoreConfidence,
  type BienScoreFactor,
  type BienScoreFeatures,
  type BienSubScore,
} from '@civora/shared-types';

const FORMULA_DOC_URL = '/docs/scoring/biens.md';

// Poids du score global — somme = 1.0
const W_OCCUPATION = 0.3;
const W_RENTABILITE = 0.3;
const W_DIVERSIFICATION = 0.2; // exposé via le sous-score 'risque' ici
const W_DEMANDE = 0.2;

// ─────────────────────────────────────────────────────────────────────────────
// Sous-scores individuels
// ─────────────────────────────────────────────────────────────────────────────

function scoreOccupation(f: BienScoreFeatures): { sub: BienSubScore; factors: BienScoreFactor[] } {
  if (typeof f.occupation_12m === 'number') {
    const v = clamp0_100(stepOccupation(f.occupation_12m));
    return {
      sub: { value: v, grade: gradeFromValue(v), confidence: 'high' },
      factors: [{
        code: 'occupation_12m',
        label: `Occupation ${f.occupation_12m.toFixed(0)}% sur 12 mois`,
        contribution: v,
        category: 'occupation',
      }],
    };
  }
  // Fallback : estimation depuis le statut courant
  const v = ({
    loue: 80,
    saisonnier: 70,
    disponible: 40,
    hors_circuit: 0,
  } as const)[f.statut ?? 'disponible'] ?? 50;
  return {
    sub: { value: v, grade: gradeFromValue(v), confidence: 'low' },
    factors: [{
      code: 'occupation_estimation_statut',
      label: `Estimation (statut "${f.statut ?? 'disponible'}")`,
      contribution: v,
      category: 'occupation',
    }],
  };
}

function stepOccupation(pct: number): number {
  if (pct >= 90) return 100;
  if (pct >= 70) return 80;
  if (pct >= 50) return 60;
  if (pct >= 30) return 40;
  return 20;
}

function scoreRentabilite(f: BienScoreFeatures): { sub: BienSubScore; factors: BienScoreFactor[] } {
  if (typeof f.yield_brut_pct === 'number') {
    const v = clamp0_100(stepYield(f.yield_brut_pct));
    return {
      sub: { value: v, grade: gradeFromValue(v), confidence: 'high' },
      factors: [{
        code: 'yield_brut',
        label: `Rendement brut ${f.yield_brut_pct.toFixed(1)}%`,
        contribution: v,
        category: 'rentabilite',
      }],
    };
  }
  return {
    sub: { value: 50, grade: gradeFromValue(50), confidence: 'low' },
    factors: [{
      code: 'yield_unknown',
      label: 'Rendement non calculable (prix/loyer manquants)',
      contribution: 50,
      category: 'rentabilite',
    }],
  };
}

function stepYield(pct: number): number {
  if (pct >= 10) return 100;
  if (pct >= 8) return 85;
  if (pct >= 6) return 70;
  if (pct >= 4) return 50;
  return 30;
}

function scoreEtat(f: BienScoreFeatures): { sub: BienSubScore; factors: BienScoreFactor[] } {
  const tags = f.tags ?? [];
  if (tags.includes('etat_neuf')) {
    return {
      sub: { value: 95, grade: 'A+', confidence: 'high' },
      factors: [{ code: 'etat_neuf', label: 'Bien neuf', contribution: 95, category: 'etat' }],
    };
  }
  if (tags.includes('renove')) {
    return {
      sub: { value: 85, grade: 'A', confidence: 'high' },
      factors: [{ code: 'renove', label: 'Bien rénové', contribution: 85, category: 'etat' }],
    };
  }
  if (tags.includes('a_renover')) {
    return {
      sub: { value: 45, grade: 'D', confidence: 'high' },
      factors: [{ code: 'a_renover', label: 'À rénover', contribution: 45, category: 'etat' }],
    };
  }
  if (tags.includes('vetuste')) {
    return {
      sub: { value: 25, grade: 'D', confidence: 'high' },
      factors: [{ code: 'vetuste', label: 'Vétuste', contribution: 25, category: 'etat' }],
    };
  }
  return {
    sub: { value: 60, grade: 'B', confidence: 'low' },
    factors: [{
      code: 'etat_inconnu',
      label: 'État non renseigné (estimation neutre)',
      contribution: 60,
      category: 'etat',
    }],
  };
}

function scoreDemande(market: BienMarketContext): { sub: BienSubScore; factors: BienScoreFactor[] } {
  if (market.commune_total === 0) {
    return {
      sub: { value: 60, grade: 'B', confidence: 'low' },
      factors: [{ code: 'pas_de_marche', label: 'Pas de données sur la commune', contribution: 60, category: 'demande' }],
    };
  }
  const ratio = market.commune_loues / market.commune_total;
  const v = ratio > 0.8 ? 100 : ratio > 0.6 ? 80 : 60;
  return {
    sub: { value: v, grade: gradeFromValue(v), confidence: market.commune_total >= 5 ? 'high' : 'medium' },
    factors: [{
      code: 'demande_commune',
      label: `Taux d'occupation commune : ${(ratio * 100).toFixed(0)}% (${market.commune_total} biens)`,
      contribution: v,
      category: 'demande',
    }],
  };
}

function scoreRisque(
  f: BienScoreFeatures,
  market: BienMarketContext,
): { sub: BienSubScore; factors: BienScoreFactor[] } {
  let v = 70;
  const factors: BienScoreFactor[] = [];
  let confidence: BienScoreConfidence = 'low';

  if (market.is_unique_type_commune) {
    v -= 20;
    factors.push({
      code: 'concentration_solo',
      label: 'Seul bien de ce type dans cette commune',
      contribution: -20,
      category: 'risque',
    });
  } else {
    factors.push({
      code: 'diversification_ok',
      label: 'Présence d\'autres biens similaires (mutualisation risque)',
      contribution: 0,
      category: 'risque',
    });
  }

  if (typeof f.impaye_count_12m === 'number' && f.impaye_count_12m > 0) {
    const penalty = Math.min(40, f.impaye_count_12m * 10);
    v -= penalty;
    factors.push({
      code: 'impayes',
      label: `${f.impaye_count_12m} incident(s) d'impayé 12 mois`,
      contribution: -penalty,
      category: 'risque',
    });
    confidence = 'high';
  }

  v = clamp0_100(v);
  return {
    sub: { value: v, grade: gradeFromValue(v), confidence },
    factors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Score global
// ─────────────────────────────────────────────────────────────────────────────

export function computeBienScore(
  features: BienScoreFeatures,
  market: BienMarketContext,
): BienScoreBreakdown {
  const occ = scoreOccupation(features);
  const rent = scoreRentabilite(features);
  const etat = scoreEtat(features);
  const dem = scoreDemande(market);
  const risq = scoreRisque(features, market);

  const global = clamp0_100(
    W_OCCUPATION * occ.sub.value +
      W_RENTABILITE * rent.sub.value +
      W_DEMANDE * dem.sub.value +
      W_DIVERSIFICATION * risq.sub.value,
  );

  // Note : `etat` n'est pas dans la formule globale (volontairement — on évite
  // la double-pénalisation avec rentabilite). Il reste exposé en sous-score
  // informatif pour le frontend.

  const confidence = combineConfidence(
    occ.sub.confidence,
    rent.sub.confidence,
    dem.sub.confidence,
    risq.sub.confidence,
  );

  return {
    global: {
      value: Math.round(global),
      grade: gradeFromValue(global),
      confidence,
    },
    sub_scores: {
      occupation: occ.sub,
      rentabilite: rent.sub,
      etat: etat.sub,
      demande: dem.sub,
      risque: risq.sub,
    },
    factors: [...occ.factors, ...rent.factors, ...etat.factors, ...dem.factors, ...risq.factors],
    computed_at: new Date().toISOString(),
    formula_doc: FORMULA_DOC_URL,
  };
}

/** Calcule yield_brut_pct depuis prix_vente_xof + loyer_mensuel_xof. */
export function computeYieldBrutPct(
  loyer_mensuel_xof: bigint | null | undefined,
  prix_vente_xof: bigint | null | undefined,
): number | null {
  if (!loyer_mensuel_xof || !prix_vente_xof || prix_vente_xof === 0n) return null;
  const loyerAnnuel = Number(loyer_mensuel_xof) * 12;
  const pct = (loyerAnnuel / Number(prix_vente_xof)) * 100;
  return Number(pct.toFixed(2));
}

function clamp0_100(v: number): number {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}
