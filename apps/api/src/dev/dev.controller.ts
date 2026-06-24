import { Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';

import type { JwtPayload } from '../_core/auth/decorators/current-user.decorator';
import { CurrentUser } from '../_core/auth/decorators/current-user.decorator';
import { createDomainEvent } from '../_core/events/domain-event';
import { EventBusService } from '../_core/events/event-bus.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

/**
 * Endpoint de test disponible uniquement hors production.
 * Permet de valider manuellement le flux Outbox sans module métier.
 */
@Controller('_dev')
export class DevController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('emit-test-event')
  async emitTestEvent(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ event_id: string; message: string }> {
    const event = createDomainEvent({
      agence_id: user.agence_id,
      type: 'demo.test_event',
      aggregate_type: 'Demo',
      aggregate_id: user.sub,
      payload: { message: 'événement de test', triggered_by: user.email },
      metadata: {
        actor_id: user.sub,
        correlation_id: (req.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID(),
        causation_id: null,
        ip: req.ip ?? null,
        user_agent: (req.headers['user-agent'] as string | undefined) ?? null,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.eventBus.emit(event, tx);
    });

    return {
      event_id: event.id,
      message: `Événement "${event.type}" inscrit en outbox. Vérifiez domain_events et BullMQ.`,
    };
  }
}
