import type { WorkerOptions } from 'bullmq';

export const QUEUE_NAMES = [
  'pdf',
  'ocr',
  'ai',
  'messaging',
  'payments',
  'ota',
  'reports',
  'imports',
  'exports',
  'scheduled',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface QueueConfig {
  concurrency: number;
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
}

export const QUEUES: Record<QueueName, QueueConfig> = {
  pdf:       { concurrency: 4,  attempts: 3,  backoff: { type: 'exponential', delay: 5_000 } },
  ocr:       { concurrency: 4,  attempts: 5,  backoff: { type: 'exponential', delay: 10_000 } },
  ai:        { concurrency: 8,  attempts: 3,  backoff: { type: 'exponential', delay: 3_000 } },
  messaging: { concurrency: 10, attempts: 5,  backoff: { type: 'exponential', delay: 5_000 } },
  payments:  { concurrency: 2,  attempts: 10, backoff: { type: 'exponential', delay: 15_000 } },
  ota:       { concurrency: 4,  attempts: 5,  backoff: { type: 'exponential', delay: 10_000 } },
  reports:   { concurrency: 2,  attempts: 2,  backoff: { type: 'exponential', delay: 30_000 } },
  // imports/exports : 1 seul retry — un import qui échoue doit etre re-déclenché
  // manuellement (l'agence doit relire le rapport d'erreurs).
  imports:   { concurrency: 2,  attempts: 1,  backoff: { type: 'exponential', delay: 30_000 } },
  exports:   { concurrency: 2,  attempts: 1,  backoff: { type: 'exponential', delay: 30_000 } },
  scheduled: { concurrency: 2,  attempts: 3,  backoff: { type: 'exponential', delay: 60_000 } },
} as const;

/** Options BullMQ par défaut héritées de la config de la file */
export function defaultJobOptions(queue: QueueName): Pick<WorkerOptions, 'concurrency'> & {
  defaultJobOptions: { attempts: number; backoff: QueueConfig['backoff'] };
} {
  const cfg = QUEUES[queue];
  return {
    concurrency: cfg.concurrency,
    defaultJobOptions: {
      attempts: cfg.attempts,
      backoff: cfg.backoff,
    },
  };
}
