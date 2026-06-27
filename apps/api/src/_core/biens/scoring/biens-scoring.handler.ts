import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import type { DomainEvent } from '../../events/domain-event';
import { OnDomainEvent } from '../../events/event-handler.decorator';
import { QueueManagerService } from '../../jobs/queue-manager.service';

import { BienEventType } from '../events/bien-events';

/**
 * Handler qui réagit aux events Bien et enfile un job de re-scoring.
 *
 * Le worker fait le calcul lourd ; ce handler ne fait que la mise en file.
 * Idempotent : la clé du job est `score-<bien_id>` → BullMQ dédupliquera
 * les events trop rapprochés.
 */
@Injectable()
export class BiensScoringHandler {
  private readonly logger = new Logger(BiensScoringHandler.name);

  constructor(private readonly queue: QueueManagerService) {}

  @OnDomainEvent(BienEventType.Created)
  async onCreated(event: DomainEvent<{ bien_id: string; actor_id: string | null }>): Promise<void> {
    await this.enqueue(event, 'created');
  }

  @OnDomainEvent(BienEventType.Updated)
  async onUpdated(event: DomainEvent<{ bien_id: string; actor_id: string | null }>): Promise<void> {
    await this.enqueue(event, 'updated');
  }

  @OnDomainEvent(BienEventType.StatutChanged)
  async onStatutChanged(
    event: DomainEvent<{ bien_id: string; actor_id: string | null }>,
  ): Promise<void> {
    await this.enqueue(event, 'statut_changed');
  }

  @OnDomainEvent(BienEventType.PhotoAdded)
  async onPhotoAdded(
    event: DomainEvent<{ bien_id: string; actor_id: string | null }>,
  ): Promise<void> {
    await this.enqueue(event, 'photo_added');
  }

  private async enqueue(
    event: DomainEvent<{ bien_id: string; actor_id: string | null }>,
    trigger: 'created' | 'updated' | 'statut_changed' | 'photo_added',
  ): Promise<void> {
    if (!event.agence_id) return;
    await this.queue.add(
      'biens-scoring',
      'bien.score',
      {
        agence_id: event.agence_id,
        actor_id: event.payload.actor_id ?? null,
        correlation_id: event.metadata.correlation_id ?? randomUUID(),
        bien_id: event.payload.bien_id,
        trigger,
      },
      // Idempotence par bien : agrège les events rapprochés
      { jobId: `score-${event.payload.bien_id}` },
    );
    this.logger.debug(`Enfilé scoring ${event.payload.bien_id} (trigger=${trigger})`);
  }
}
