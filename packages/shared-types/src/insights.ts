import { z } from 'zod';

export const INSIGHT_MODULES = ['biens', 'contacts', 'locations', 'ventes', 'compta'] as const;
export type InsightModule = (typeof INSIGHT_MODULES)[number];

export const INSIGHT_SEVERITIES = ['info', 'warn', 'critical'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export const INSIGHT_CIBLE_TYPES = [
  'bien',
  'contact',
  'agence',
  'commune',
  'bail',
  'reservation',
] as const;
export type InsightCibleType = (typeof INSIGHT_CIBLE_TYPES)[number];

/** Types métier Biens — utile pour filtrer dans le frontend. */
export const BIEN_INSIGHT_TYPES = [
  'repositionnement',
  'pricing_sous_marche',
  'pricing_sur_marche',
  'diversification_faible',
  'demande_forte_zone',
  'anomalie_loyer',
  'anomalie_prix',
] as const;
export type BienInsightType = (typeof BIEN_INSIGHT_TYPES)[number];

export interface InsightDto {
  id: string;
  module: InsightModule;
  type: string;
  cible_type: InsightCibleType | null;
  cible_id: string | null;
  severity: InsightSeverity;
  titre: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  data: Record<string, unknown>;
  dismissed_at: string | null;
  acted_on_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export const ListInsightsQuerySchema = z.object({
  module: z.enum(INSIGHT_MODULES).optional(),
  severity: z.enum(INSIGHT_SEVERITIES).optional(),
  cible_type: z.enum(INSIGHT_CIBLE_TYPES).optional(),
  cible_id: z.string().uuid().optional(),
  dismissed: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListInsightsQuery = z.infer<typeof ListInsightsQuerySchema>;
