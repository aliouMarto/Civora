/**
 * Heuristique de scoring contacts — Lot 1 Module 1 Étape 3.
 *
 * Formule transparente documentée dans docs/scoring/contacts.md.
 * Le scoring sera remplacé par un modèle ML quand assez de données seront
 * disponibles (R2+). Le contrat de sortie ne changera pas (score, category,
 * confidence, factors).
 *
 * Cette fonction est PURE — pas d'IO, pas d'effet de bord. Elle est
 * partagée verbatim côté service Python (apps/ai/app/scoring/) — toute
 * modification doit être synchronisée et couverte par le test de parité.
 */

export type ContactSourceFeature =
  | 'referencement'
  | 'reseau'
  | 'site_web'
  | 'portail'
  | 'walk_in'
  | 'import'
  | 'autre'
  | null;

export type ScoreCategory = 'froid' | 'tiede' | 'chaud';
export type ScoreConfidence = 'low' | 'medium' | 'high';

export interface ScoringFeatures {
  /** Email présent et non vide */
  has_email: boolean;
  /** Téléphone E.164 valide */
  has_valid_phone: boolean;
  /** Ville ET commune renseignées */
  has_address: boolean;
  /** Au moins un tag OU un segment_ia */
  has_tag_or_segment: boolean;
  /** Nombre d'interactions sortantes (email/whatsapp/sms/appel) sur 90j */
  interactions_outgoing_90d: number;
  /** Nombre d'interactions entrantes sur 90j */
  interactions_incoming_90d: number;
  /** Nombre de visites réalisées sur 90j (R3+, 0 sinon) */
  visits_completed_90d: number;
  /** Source d'acquisition */
  source: ContactSourceFeature;
  /** Nombre total de rôles cumulés (prospect, locataire, propriétaire...) */
  roles_count: number;
  /** WhatsApp opt-in explicite */
  whatsapp_opt_in: boolean;
  /** Jours depuis la dernière interaction (null si jamais) */
  days_since_last_interaction: number | null;
  /** Nombre total d'interactions enregistrées (pour la confidence) */
  total_interactions: number;
}

export interface ScoringFactor {
  code: string;
  label: string;
  contribution: number;
  category:
    | 'completeness'
    | 'engagement'
    | 'source'
    | 'roles'
    | 'whatsapp'
    | 'penalty';
}

export interface ScoringResult {
  score: number;
  category: ScoreCategory;
  confidence: ScoreConfidence;
  factors: ScoringFactor[];
}

const SOURCE_WEIGHTS: Record<NonNullable<ContactSourceFeature>, number> = {
  referencement: 15,
  reseau: 12,
  site_web: 8,
  portail: 6,
  walk_in: 5,
  import: 0,
  autre: 0,
};

const CAP = {
  completeness: 20,
  engagement: 30,
  source: 15,
  roles: 10,
  whatsapp: 10,
};

const PENALTY = {
  inactive_180: -5,
  inactive_365: -10,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function categorize(score: number): ScoreCategory {
  if (score >= 70) return 'chaud';
  if (score >= 40) return 'tiede';
  return 'froid';
}

function computeConfidence(total: number): ScoreConfidence {
  if (total < 5) return 'low';
  if (total < 20) return 'medium';
  return 'high';
}

/**
 * Calcule le score d'un contact à partir de ses features. PURE.
 */
export function computeScore(features: ScoringFeatures): ScoringResult {
  const factors: ScoringFactor[] = [];

  // 1. Complétude du profil
  let completeness = 0;
  if (features.has_email) {
    completeness += 5;
    factors.push({ code: 'profile.email', label: 'Email renseigné', contribution: 5, category: 'completeness' });
  }
  if (features.has_valid_phone) {
    completeness += 5;
    factors.push({ code: 'profile.phone', label: 'Téléphone E.164 valide', contribution: 5, category: 'completeness' });
  }
  if (features.has_address) {
    completeness += 5;
    factors.push({ code: 'profile.address', label: 'Ville + commune renseignées', contribution: 5, category: 'completeness' });
  }
  if (features.has_tag_or_segment) {
    completeness += 5;
    factors.push({ code: 'profile.tag', label: 'Au moins un tag ou segment', contribution: 5, category: 'completeness' });
  }
  completeness = Math.min(completeness, CAP.completeness);

  // 2. Engagement récent (90j)
  let engagementRaw = 0;
  const outgoingPts = features.interactions_outgoing_90d * 3;
  const incomingPts = features.interactions_incoming_90d * 5;
  const visitsPts = features.visits_completed_90d * 10;
  engagementRaw = outgoingPts + incomingPts + visitsPts;
  const engagement = Math.min(engagementRaw, CAP.engagement);

  if (outgoingPts > 0) {
    factors.push({
      code: 'engagement.outgoing_90d',
      label: `${features.interactions_outgoing_90d} interaction(s) sortante(s) 90j`,
      contribution: outgoingPts,
      category: 'engagement',
    });
  }
  if (incomingPts > 0) {
    factors.push({
      code: 'engagement.incoming_90d',
      label: `${features.interactions_incoming_90d} interaction(s) entrante(s) 90j`,
      contribution: incomingPts,
      category: 'engagement',
    });
  }
  if (visitsPts > 0) {
    factors.push({
      code: 'engagement.visits_90d',
      label: `${features.visits_completed_90d} visite(s) réalisée(s) 90j`,
      contribution: visitsPts,
      category: 'engagement',
    });
  }
  if (engagementRaw > CAP.engagement) {
    factors.push({
      code: 'engagement.capped',
      label: `Plafond engagement atteint (${CAP.engagement})`,
      contribution: -(engagementRaw - CAP.engagement),
      category: 'engagement',
    });
  }

  // 3. Source d'acquisition
  let source = 0;
  if (features.source && features.source in SOURCE_WEIGHTS) {
    source = SOURCE_WEIGHTS[features.source as NonNullable<ContactSourceFeature>];
    if (source > 0) {
      factors.push({
        code: `source.${features.source}`,
        label: `Source : ${features.source}`,
        contribution: source,
        category: 'source',
      });
    }
  }

  // 4. Rôles cumulés (+5 par rôle au-delà du premier)
  let roles = 0;
  if (features.roles_count > 1) {
    roles = Math.min((features.roles_count - 1) * 5, CAP.roles);
    factors.push({
      code: 'roles.cumulated',
      label: `${features.roles_count} rôles cumulés`,
      contribution: roles,
      category: 'roles',
    });
  }

  // 5. WhatsApp opt-in
  let whatsapp = 0;
  if (features.whatsapp_opt_in) {
    whatsapp = CAP.whatsapp;
    factors.push({
      code: 'whatsapp.opt_in',
      label: 'WhatsApp opt-in confirmé',
      contribution: whatsapp,
      category: 'whatsapp',
    });
  }

  // 6. Pénalités inactivité
  let penalty = 0;
  if (features.days_since_last_interaction !== null) {
    const d = features.days_since_last_interaction;
    if (d > 365) {
      penalty = PENALTY.inactive_365;
      factors.push({
        code: 'penalty.inactive_365',
        label: 'Aucune interaction depuis > 365 jours',
        contribution: penalty,
        category: 'penalty',
      });
    } else if (d > 180) {
      penalty = PENALTY.inactive_180;
      factors.push({
        code: 'penalty.inactive_180',
        label: 'Aucune interaction depuis > 180 jours',
        contribution: penalty,
        category: 'penalty',
      });
    }
  }

  const raw = completeness + engagement + source + roles + whatsapp + penalty;
  const score = clamp(raw, 0, 100);

  return {
    score,
    category: categorize(score),
    confidence: computeConfidence(features.total_interactions),
    factors,
  };
}
