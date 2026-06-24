import { Controller, Post, Req, Body } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { NotificationsService } from '../_core/notifications/notifications.service';

import type { JwtPayload } from '../_core/auth/decorators/current-user.decorator';
import { CurrentUser } from '../_core/auth/decorators/current-user.decorator';
import { createDomainEvent } from '../_core/events/domain-event';
import { EventBusService } from '../_core/events/event-bus.service';
import { QueueManagerService } from '../_core/jobs/queue-manager.service';
import { DEMO_QUEUE } from '../_core/jobs/workers/demo.worker';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

/**
 * Endpoints de test — disponibles uniquement hors production.
 */
@Controller('_dev')
export class DevController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly queueManager: QueueManagerService,
    private readonly notifications: NotificationsService,
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
        correlation_id:
          (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID(),
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
      message: `Événement "${event.type}" inscrit en outbox.`,
    };
  }

  @Post('jobs/ping')
  async enqueuePing(
    @CurrentUser() user: JwtPayload,
    @Body() body: { message?: string },
  ): Promise<{ job_id: string | undefined; message: string }> {
    const jobId = await this.queueManager.add(
      DEMO_QUEUE,
      'demo.ping',
      {
        agence_id: user.agence_id,
        actor_id: user.sub,
        correlation_id: randomUUID(),
        message: body.message ?? 'ping',
      },
    );

    return {
      job_id: jobId,
      message: `Job demo.ping enfilé dans la queue "${DEMO_QUEUE}" (job_id: ${jobId})`,
    };
  }

  @Post('notifications/test-email')
  async testEmail(
    @CurrentUser() user: JwtPayload,
    @Body() body: { to: string; template?: string; vars?: Record<string, string> },
  ) {
    return this.notifications.send({
      to: { email: body.to },
      channel: 'email',
      template: body.template ?? 'invitation',
      vars: body.vars ?? { nom: 'Testeur', nom_agence: 'CIVORA Dev', lien: 'http://localhost:3000', expiry: '24h' },
      language: 'fr',
    });
  }
}
