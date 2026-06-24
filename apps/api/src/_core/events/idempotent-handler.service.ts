import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { DomainEvent } from './domain-event';
import { EventHandlerRegistry } from './event-handler-registry';

/**
 * Exécute les handlers en garantissant l'idempotence via EventHandlerOffset.
 * Propage le agence_id de l'événement dans le TenantContext du handler.
 */
@Injectable()
export class IdempotentHandlerService {
  private readonly logger = new Logger(IdempotentHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EventHandlerRegistry,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const handlers = this.registry.getHandlers(event.type);
    if (handlers.length === 0) return;

    for (const handler of handlers) {
      await this.runIdempotent(handler.handlerName, event, async () => {
        if (event.agence_id) {
          await this.tenantCtx.run(event.agence_id, () => handler.fn(event));
        } else {
          await handler.fn(event);
        }
      });
    }
  }

  private async runIdempotent(
    handlerName: string,
    event: DomainEvent,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      // INSERT OR IGNORE — si la ligne existe déjà, la contrainte PK empêche l'insertion
      await this.prisma.eventHandlerOffset.create({
        data: { handler_name: handlerName, event_id: event.id },
      });
    } catch {
      // Contrainte PK violée → déjà traité
      this.logger.warn(
        `Handler ${handlerName} a déjà traité l'événement ${event.id} — skip (idempotence)`,
      );
      return;
    }

    try {
      await fn();
      this.logger.debug(`Handler ${handlerName} → ${event.type} [${event.id}] ✓`);
    } catch (err) {
      // L'offset est déjà inséré : si on rollback ici le handler ne sera PAS rejoué.
      // En cas de besoin de retry, il faut supprimer l'offset manuellement.
      this.logger.error(
        `Handler ${handlerName} a échoué pour ${event.type} [${event.id}]`,
        err,
      );
      throw err;
    }
  }
}
