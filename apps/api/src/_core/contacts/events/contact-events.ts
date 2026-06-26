/**
 * Événements de domaine du module Contacts.
 *
 * Tous émis via OutboxService (dans la même transaction que l'écriture
 * métier qui les provoque) — c'est le Workflow Engine qui réagit
 * (envoi de mail de bienvenue, scoring IA, etc.).
 */

export const ContactEventType = {
  Created: 'contact.created',
  Updated: 'contact.updated',
  Archived: 'contact.archived',
  Merged: 'contact.merged',
  ScoreChanged: 'contact.score_changed',
} as const;

export type ContactEventTypeName = (typeof ContactEventType)[keyof typeof ContactEventType];

export interface ContactCreatedPayload {
  contact_id: string;
  agence_id: string;
  actor_id: string | null;
  roles: string[];
  source: string | null;
  email_present: boolean;
  telephone_present: boolean;
}

export interface ContactUpdatedPayload {
  contact_id: string;
  agence_id: string;
  actor_id: string | null;
  changes: Record<string, { before: unknown; after: unknown }>;
}

export interface ContactArchivedPayload {
  contact_id: string;
  agence_id: string;
  actor_id: string | null;
  archived_at: string;
}

export interface ContactMergedPayload {
  master_id: string;
  source_ids: string[];
  agence_id: string;
  actor_id: string | null;
  strategy: string;
  interactions_moved: number;
  segments_moved: number;
}

export interface ContactScoreChangedPayload {
  contact_id: string;
  agence_id: string;
  actor_id: string | null;
  score_before: number | null;
  score_after: number;
  categorie_before: string | null;
  categorie_after: string;
}
