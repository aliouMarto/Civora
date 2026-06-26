export const InteractionEventType = {
  Recorded: 'contact.interaction_recorded',
} as const;

export type InteractionEventTypeName = (typeof InteractionEventType)[keyof typeof InteractionEventType];

export interface InteractionRecordedPayload {
  interaction_id: string;
  contact_id: string;
  agence_id: string;
  actor_id: string | null;
  type: string;
  direction: string | null;
  occurred_at: string;
}
