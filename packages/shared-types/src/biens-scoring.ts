/**
 * Modèle de score portefeuille du module Biens.
 *
 * 5 sous-scores 0-100 → score global 0-100 → grade A+/A/B+/B/C/D.
 *
 * Confidence reflète la qualité des données :
 *   - 'high'   : tous les sous-scores ont des données réelles
 *   - 'medium' : au moins un sous-score est en estimation
 *   - 'low'    : la majorité des sous-scores sont des défauts
 *
 * La formule est entièrement déterministe et documentée dans
 * `docs/scoring/biens.md`.
 */

export const BIEN_SCORE_GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D'] as const;
export type BienScoreGrade = (typeof BIEN_SCORE_GRADES)[number];

export const BIEN_SCORE_CONFIDENCES = ['low', 'medium', 'high'] as const;
export type BienScoreConfidence = (typeof BIEN_SCORE_CONFIDENCES)[number];

export interface BienScoreFactor {
  code: string;
  label: string;
  contribution: number; // 0–100, contribution brute au sous-score
  category: 'occupation' | 'rentabilite' | 'etat' | 'demande' | 'risque';
}

export interface BienSubScore {
  value: number;          // 0-100
  grade: BienScoreGrade;
  confidence: BienScoreConfidence;
}

export interface BienScoreBreakdown {
  global: {
    value: number;
    grade: BienScoreGrade;
    confidence: BienScoreConfidence;
  };
  sub_scores: {
    occupation: BienSubScore;
    rentabilite: BienSubScore;
    etat: BienSubScore;
    demande: BienSubScore;
    risque: BienSubScore;
  };
  factors: BienScoreFactor[];
  computed_at: string; // ISO
  formula_doc: string; // chemin vers la doc transparente
}

/**
 * Features d'entrée pour le scoring. Toutes optionnelles : l'algo dégrade
 * la confidence quand les données manquent.
 */
export interface BienScoreFeatures {
  // Yield brut (loyer annuel / prix de vente, en %). Si null, calculé côté
  // service quand prix_vente_xof et loyer_mensuel_xof sont posés.
  yield_brut_pct?: number | null;
  // Données R2 (à brancher) — % d'occupation sur les 12 derniers mois
  occupation_12m?: number | null;
  // Tags d'état déclarés par l'agence
  tags?: string[];
  // Statut courant (utilisé en fallback quand occupation_12m absent)
  statut?: 'disponible' | 'loue' | 'saisonnier' | 'hors_circuit';
  // Données R2 (à brancher) — incidents d'impayé
  impaye_count_12m?: number | null;
}

/**
 * Contexte marché (calculé par le service à partir de la vue
 * v_biens_par_commune et du catalogue agence).
 */
export interface BienMarketContext {
  commune_total: number;          // nb de biens dans la commune
  commune_loues: number;          // nb de biens loués dans la commune
  // Diversification : type+commune unique du bien dans le portefeuille de l'agence
  is_unique_type_commune: boolean;
}

/** Mappe une valeur 0-100 vers un grade lettre. */
export function gradeFromValue(value: number): BienScoreGrade {
  if (value >= 95) return 'A+';
  if (value >= 85) return 'A';
  if (value >= 75) return 'B+';
  if (value >= 65) return 'B';
  if (value >= 55) return 'C';
  return 'D';
}

/** Combine plusieurs confidences (low > medium > high — la pire gagne). */
export function combineConfidence(...c: BienScoreConfidence[]): BienScoreConfidence {
  if (c.some((x) => x === 'low')) return 'low';
  if (c.some((x) => x === 'medium')) return 'medium';
  return 'high';
}
