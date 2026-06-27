/**
 * Événements de domaine du module Biens.
 *
 * Tous émis via Outbox (mêmes patterns que Contacts) — c'est le Workflow
 * Engine et le worker de scoring qui réagissent. Les montants sont
 * sérialisés en string car BigInt n'est pas JSON-safe.
 */

export const BienEventType = {
  Created: 'bien.created',
  Updated: 'bien.updated',
  StatutChanged: 'bien.statut_changed',
  Archived: 'bien.archived',
  PhotoAdded: 'bien.photo_added',
  PhotoRemoved: 'bien.photo_removed',
  ScoreChanged: 'bien.score_changed',
} as const;
export type BienEventTypeName = (typeof BienEventType)[keyof typeof BienEventType];

export interface BienCreatedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  reference: string;
  type: string;
  usage: string;
  statut: string;
  ville: string;
  commune: string | null;
}

export interface BienUpdatedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  /** Diff : champ → { before, after }. BigInt sérialisés en string. */
  changes: Record<string, { before: unknown; after: unknown }>;
}

export interface BienStatutChangedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  statut_before: string;
  statut_after: string;
  source: 'manuel' | 'bail' | 'reservation';
}

export interface BienArchivedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  archived_at: string;
}

export interface BienPhotoAddedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  photo_id: string;
  storage_key: string;
  ordre: number;
}

export interface BienPhotoRemovedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  photo_id: string;
  storage_key: string;
}

export interface BienScoreChangedPayload {
  bien_id: string;
  agence_id: string;
  actor_id: string | null;
  score_before: number | null;
  score_after: number;
}
