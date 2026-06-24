import { randomUUID } from 'node:crypto';

export interface EventMetadata {
  actor_id: string | null;      // utilisateur_id de l'initiateur (null si système)
  correlation_id: string;       // propagé depuis X-Correlation-Id ou généré
  causation_id: string | null;  // event_id de l'événement qui a causé celui-ci
  ip: string | null;
  user_agent: string | null;
}

export interface DomainEvent<TPayload = unknown> {
  readonly id: string;
  readonly agence_id: string | null;
  readonly type: string;
  readonly version: number;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
  readonly occurred_at: Date;
}

export function createDomainEvent<TPayload>(
  params: Omit<DomainEvent<TPayload>, 'id' | 'occurred_at' | 'version'> & { version?: number },
): DomainEvent<TPayload> {
  return {
    id: randomUUID(),
    version: params.version ?? 1,
    occurred_at: new Date(),
    ...params,
  };
}
