import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import type { Env } from '../../infrastructure/config/env.schema';
import type { BaseJobPayload } from './job-types';
import { QUEUES, QUEUE_NAMES, type QueueName } from './queues.config';

/**
 * Gère les 8 instances Queue BullMQ (côté producteur).
 * Les workers sont des services séparés.
 */
@Injectable()
export class QueueManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueManagerService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });

    for (const name of QUEUE_NAMES) {
      const cfg = QUEUES[name];
      const queue = new Queue(name, {
        connection: { url: redisUrl },
        defaultJobOptions: {
          attempts: cfg.attempts,
          backoff: cfg.backoff,
          removeOnComplete: { count: 1000 },
          removeOnFail: false,   // garder les fails pour le diagnostic
        },
      });
      this.queues.set(name, queue);
    }

    this.logger.log(`${QUEUE_NAMES.length} files BullMQ initialisées: ${QUEUE_NAMES.join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  get<TPayload extends BaseJobPayload = BaseJobPayload>(name: QueueName): Queue<TPayload> {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue "${name}" non initialisée`);
    return queue as Queue<TPayload>;
  }

  getAll(): Queue[] {
    return [...this.queues.values()];
  }

  async add<TPayload extends BaseJobPayload>(
    queue: QueueName,
    jobName: string,
    payload: TPayload,
    opts: { jobId?: string } = {},
  ): Promise<string | undefined> {
    const q = this.get<TPayload>(queue);
    const job = await q.add(jobName, payload, {
      jobId: opts.jobId, // idempotence : BullMQ déduplique sur jobId
    });
    return job.id;
  }
}
