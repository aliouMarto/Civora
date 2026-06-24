import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import type { Env } from '../../infrastructure/config/env.schema';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { DeadLetterService } from './dead-letter.service';
import type { BaseJobPayload } from './job-types';
import type { QueueName } from './queues.config';
import { QUEUES } from './queues.config';

/**
 * Classe de base pour tous les workers BullMQ de CIVORA.
 *
 * Fournit gratuitement :
 *   - propagation du agence_id → TenantContextService
 *   - logging structuré (start / success / fail + durée)
 *   - DLQ sur épuisement des tentatives
 *   - hook Sentry (activé à l'étape 12 — captureException est un no-op ici)
 *   - idempotence par clé (par défaut : job.id)
 *
 * Usage : étendre cette classe, implémenter process() et appeler super.register().
 */
export abstract class BaseWorkerService<TPayload extends BaseJobPayload = BaseJobPayload>
  implements OnModuleInit, OnModuleDestroy
{
  protected abstract readonly queueName: QueueName;
  protected readonly logger = new Logger(this.constructor.name);
  private worker: Worker<TPayload> | null = null;

  constructor(
    protected readonly config: ConfigService<Env, true>,
    protected readonly tenantCtx: TenantContextService,
    protected readonly deadLetter: DeadLetterService,
  ) {}

  /**
   * Méthode à implémenter dans chaque sous-classe.
   * Reçoit le job avec son payload typé. Le contexte tenant est déjà positionné.
   */
  abstract process(job: Job<TPayload>): Promise<unknown>;

  /**
   * Retourne la clé d'idempotence du job.
   * Par défaut : job.id. Surcharger pour une clé métier.
   */
  protected idempotencyKey(job: Job<TPayload>): string {
    return job.id ?? `${job.queueName}:${job.name}`;
  }

  onModuleInit(): void {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    const cfg = QUEUES[this.queueName];

    this.worker = new Worker<TPayload>(
      this.queueName,
      async (job) => this.handle(job),
      {
        connection: { url: redisUrl },
        concurrency: cfg.concurrency,
      },
    );

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? cfg.attempts);
      if (isLastAttempt) {
        await this.deadLetter.record(job as Job<BaseJobPayload>, err);
      }
    });

    this.logger.log(`Worker démarré: ${this.queueName} (concurrency=${cfg.concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async handle(job: Job<TPayload>): Promise<unknown> {
    const startMs = Date.now();
    const key = this.idempotencyKey(job);
    this.logger.log(`[${this.queueName}] Démarrage job ${job.name} [${key}]`);

    try {
      let result: unknown;

      if (job.data.agence_id) {
        result = await this.tenantCtx.run(job.data.agence_id, () => this.process(job));
      } else {
        result = await this.process(job);
      }

      const ms = Date.now() - startMs;
      this.logger.log(`[${this.queueName}] Job ${job.name} [${key}] terminé en ${ms}ms`);
      return result;
    } catch (err) {
      const ms = Date.now() - startMs;
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[${this.queueName}] Job ${job.name} [${key}] échoué après ${ms}ms (tentative ${job.attemptsMade + 1})`,
        error.stack,
      );
      // Hook Sentry — no-op jusqu'à l'étape 12
      this.captureException(error, job);
      throw err; // Re-throw pour que BullMQ gère le retry
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected captureException(_err: Error, _job: Job<TPayload>): void {
    // Sentry.captureException(err, { extra: { job: job.name, queue: this.queueName } })
    // Activé à l'étape 12
  }
}
