import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BaseJobPayload } from './job-types';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    job: Job<BaseJobPayload>,
    error: Error,
  ): Promise<void> {
    const agence_id = job.data.agence_id ?? null;

    try {
      await this.prisma.jobDeadLetter.create({
        data: {
          agence_id,
          queue: job.queueName,
          job_name: job.name,
          job_id: job.id ?? 'unknown',
          payload: job.data as Record<string, unknown>,
          error: error.message,
          stack: error.stack ?? null,
          attempts: job.attemptsMade,
        },
      });

      this.logger.error(
        `[DLQ] Job mort: ${job.queueName}/${job.name} [${job.id}] — ${error.message}`,
      );
    } catch (dlqErr) {
      // Échec d'insertion en DLQ : logguer sans propager (éviter la boucle infinie)
      this.logger.error('[DLQ] Impossible d\'insérer en dead-letter', dlqErr);
    }
  }
}
