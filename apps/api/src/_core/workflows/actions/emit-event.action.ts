import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { createDomainEvent } from '../../events/domain-event';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import type { EmitEventActionConfig, ActionResult } from './action.interface';
import { resolveTemplate } from '../workflow-template.util';

@Injectable()
export class EmitEventAction {
  private readonly logger = new Logger(EmitEventAction.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async execute(
    config: EmitEventActionConfig,
    context: Record<string, unknown>,
    dryRun = false,
  ): Promise<ActionResult> {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config.payload_mapping)) {
      payload[k] = resolveTemplate(v, context);
    }

    if (dryRun) {
      return { kind: 'emit-event', status: 'skipped', output: { dry_run: true, event_type: config.event_type, payload } };
    }

    try {
      const agence_id = this.tenantCtx.getAgenceId();
      const event = createDomainEvent({
        agence_id,
        type: config.event_type,
        aggregate_type: 'Workflow',
        aggregate_id: (context['workflow_id'] as string) ?? '00000000-0000-0000-0000-000000000000',
        payload,
        metadata: {
          actor_id: null,
          correlation_id: (context['correlation_id'] as string) ?? null,
          causation_id: null,
          ip: null,
          user_agent: null,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        await this.eventBus.emit(event, tx);
      });

      return { kind: 'emit-event', status: 'success', output: { event_id: event.id } };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`emit-event action failed: ${msg}`);
      return { kind: 'emit-event', status: 'failed', error: msg };
    }
  }
}
