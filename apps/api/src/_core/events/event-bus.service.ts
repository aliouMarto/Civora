import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { DomainEvent } from './domain-event';
import { EventContextService } from './event-context.service';
import { OutboxService } from './outbox.service';

/**
 * API d'émission d'événements de domaine pour les modules métier.
 * Expose deux modes :
 *   - emit(event, tx)  : dans une transaction existante (cas normal)
 *   - emitInTx(event) : ouvre une transaction dédiée (cas des one-shot sans contexte tx)
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly eventCtx: EventContextService,
  ) {}

  /**
   * Émet un événement dans une transaction Prisma existante.
   * L'événement est rollback si la transaction l'est.
   */
  async emit<TPayload>(
    event: DomainEvent<TPayload>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.outbox.emit(event, tx);
  }

  /**
   * Ouvre une transaction dédiée pour émettre un événement seul.
   * Utile uniquement si aucune transaction métier n'est en cours.
   */
  async emitInTx<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(event, tx);
    });
    this.logger.debug(`emitInTx: ${event.type} [${event.id}]`);
  }
}
