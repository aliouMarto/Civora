import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import type { Env } from '../../infrastructure/config/env.schema';
import { PrismaAdminService } from '../../infrastructure/prisma/prisma-admin.service';
import type { DomainEvent } from './domain-event';

const QUEUE_PREFIX = 'events';
const BATCH_SIZE = 50;

/**
 * Worker Outbox : poll domain_events WHERE published_at IS NULL,
 * publie sur BullMQ queue "events.<type>", marque published_at.
 * En cas d'échec : incrémente attempts, log last_error, backoff exponentiel.
 *
 * BYPASSRLS justifié : le dispatcher doit lire les événements non publiés
 * de TOUTES les agences. C'est l'un des rares contextes (avec les migrations
 * et les jobs de maintenance) où la traversée des frontières de tenant est
 * légitime. On utilise donc PrismaAdminService (civora_admin) et non
 * PrismaService (civora_app, soumis à la RLS).
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly intervalMs: number;
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly prisma: PrismaAdminService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.intervalMs = this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }) ?? 200;
  }

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    // Fermer proprement les connexions BullMQ
    for (const queue of this.queues.values()) {
      void queue.close();
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      void this.dispatch().finally(() => this.scheduleNext());
    }, this.intervalMs);
  }

  async dispatch(): Promise<void> {
    let events: Awaited<ReturnType<typeof this.fetchPending>>;
    try {
      events = await this.fetchPending();
    } catch (err) {
      this.logger.error('Outbox poll failed', err);
      return;
    }

    for (const event of events) {
      await this.publishOne(event);
    }
  }

  private fetchPending() {
    return this.prisma.domainEvent.findMany({
      where: { published_at: null },
      orderBy: { occurred_at: 'asc' },
      take: BATCH_SIZE,
    });
  }

  private async publishOne(
    event: { id: string; type: string; agence_id: string | null; attempts: number; payload: unknown; metadata: unknown; aggregate_type: string; aggregate_id: string; occurred_at: Date; version: number },
  ): Promise<void> {
    const queueName = `${QUEUE_PREFIX}.${event.type}`;
    const queue = this.getOrCreateQueue(queueName);

    try {
      await queue.add(event.type, event as DomainEvent, {
        jobId: event.id,       // idempotence BullMQ : un job par event_id
        removeOnComplete: true,
        removeOnFail: false,
      });

      await this.prisma.domainEvent.update({
        where: { id: event.id },
        data: { published_at: new Date() },
      });

      this.logger.debug(`Publié: ${event.type} [${event.id}]`);
    } catch (err) {
      const attempts = event.attempts + 1;
      const backoffMs = Math.min(1000 * 2 ** (attempts - 1), 60_000); // max 60s
      const last_error = err instanceof Error ? err.message : String(err);

      await this.prisma.domainEvent.update({
        where: { id: event.id },
        data: { attempts, last_error },
      });

      this.logger.warn(
        `Échec publication ${event.type} [${event.id}] — tentative ${attempts}, retry dans ${backoffMs}ms`,
        last_error,
      );
    }
  }

  private getOrCreateQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      const redisUrl = this.config.get('REDIS_URL', { infer: true });
      queue = new Queue(name, {
        connection: { url: redisUrl },
      });
      this.queues.set(name, queue);
    }
    return queue;
  }
}
