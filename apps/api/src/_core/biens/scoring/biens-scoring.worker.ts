import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import type { Env } from '../../../infrastructure/config/env.schema';
import { BaseWorkerService } from '../../jobs/base-worker.service';
import { DeadLetterService } from '../../jobs/dead-letter.service';
import type { BienScoringPayload } from '../../jobs/job-types';
import type { QueueName } from '../../jobs/queues.config';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { EventBusService } from '../../events/event-bus.service';
import { createDomainEvent } from '../../events/domain-event';

import { BiensScoringService } from './biens-scoring.service';
import { BienEventType, type BienScoreChangedPayload } from '../events/bien-events';

/**
 * Worker BullMQ qui recalcule le score d'un bien.
 *
 * Déclenché par les events bien.created / bien.updated / bien.statut_changed
 * / bien.photo_added via un event-handler (enregistré dans le module).
 *
 * Anti-bruit : émet `bien.score_changed` UNIQUEMENT si delta >= 5 points.
 */
@Injectable()
export class BiensScoringWorker extends BaseWorkerService<BienScoringPayload> {
  protected readonly queueName: QueueName = 'biens-scoring';

  constructor(
    config: ConfigService<Env, true>,
    tenantCtx: TenantContextService,
    deadLetter: DeadLetterService,
    private readonly scoring: BiensScoringService,
    private readonly eventBus: EventBusService,
  ) {
    super(config, tenantCtx, deadLetter);
  }

  async process(
    job: Job<BienScoringPayload>,
  ): Promise<{ bien_id: string; score: number; changed: boolean }> {
    const { bien_id, agence_id, actor_id } = job.data;
    if (!agence_id) throw new Error('agence_id manquant dans le payload');

    const { breakdown, changed, previous_score } = await this.scoring.scoreAndSave(bien_id);

    if (changed) {
      const event = createDomainEvent({
        agence_id,
        type: BienEventType.ScoreChanged,
        aggregate_type: 'Bien',
        aggregate_id: bien_id,
        payload: {
          bien_id,
          agence_id,
          actor_id: actor_id ?? null,
          score_before: previous_score,
          score_after: breakdown.global.value,
        } satisfies BienScoreChangedPayload,
        metadata: {
          actor_id: actor_id ?? null,
          correlation_id: randomUUID(),
          causation_id: null,
          ip: null,
          user_agent: null,
        },
      });
      await this.eventBus.emitInTx(event);
    }

    return { bien_id, score: breakdown.global.value, changed };
  }
}
