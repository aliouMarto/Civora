import type { DomainEvent } from '../../domain-event';

// Convention : chaque module définit ses types d'événements ici.
// Les consommateurs importent le type pour un payload typé.

export interface DemoEmitPayload {
  message: string;
  triggered_by: string;
}

export type DemoEmitEvent = DomainEvent<DemoEmitPayload>;
