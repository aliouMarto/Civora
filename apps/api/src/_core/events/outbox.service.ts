import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { DomainEvent } from './domain-event';
import { EventContextService } from './event-context.service';

/**
 * OutboxService : insertion d'un événement de domaine dans la même transaction
 * Prisma que le changement métier qui l'a provoqué.
 *
 * RÈGLE FONDAMENTALE : emit() doit TOUJOURS être appelé avec un tx (TransactionClient).
 * Appeler sans tx lève une erreur explicite — ce n'est pas un warning.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly eventCtx: EventContextService) {}

  async emit<TPayload>(
    event: DomainEvent<TPayload>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx) {
      throw new Error(
        `OutboxService.emit() appelé sans TransactionClient. ` +
        `L'événement "${event.type}" DOIT être émis dans une transaction Prisma. ` +
        `Utilisez prisma.$transaction(tx => { ... outbox.emit(event, tx) ... })`,
      );
    }

    const meta = this.eventCtx.getMetadataBase();

    await tx.domainEvent.create({
      data: {
        id: event.id,
        agence_id: event.agence_id ?? null,
        type: event.type,
        version: event.version,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        payload: event.payload as Prisma.InputJsonValue,
        metadata: {
          ...meta,
          ip: event.metadata.ip ?? null,
          user_agent: event.metadata.user_agent ?? null,
        } as Prisma.InputJsonValue,
        occurred_at: event.occurred_at,
      },
    });

    this.logger.debug(`Événement inscrit en outbox: ${event.type} [${event.id}]`);
  }
}
