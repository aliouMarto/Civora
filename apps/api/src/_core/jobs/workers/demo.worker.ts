import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import type { Env } from '../../../infrastructure/config/env.schema';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { BaseWorkerService } from '../base-worker.service';
import { DeadLetterService } from '../dead-letter.service';
import type { DemoPingPayload } from '../job-types';
import type { QueueName } from '../queues.config';

export const DEMO_QUEUE = 'ai' satisfies QueueName; // utilise la file "ai" pour la démo

@Injectable()
export class DemoWorker extends BaseWorkerService<DemoPingPayload> {
  protected readonly queueName = DEMO_QUEUE;

  constructor(
    config: ConfigService<Env, true>,
    tenantCtx: TenantContextService,
    deadLetter: DeadLetterService,
  ) {
    super(config, tenantCtx, deadLetter);
  }

  async process(job: Job<DemoPingPayload>): Promise<{ pong: true; agence_id: string | null }> {
    // Le TenantContextService est déjà positionné par BaseWorkerService
    const agence_id = this.tenantCtx.getAgenceId();

    this.logger.log(
      `pong — message="${job.data.message ?? ''}" agence_id="${agence_id}"`,
    );

    return { pong: true, agence_id };
  }
}
