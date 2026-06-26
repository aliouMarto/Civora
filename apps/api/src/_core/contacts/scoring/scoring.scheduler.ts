import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaAdminService } from '../../../infrastructure/prisma/prisma-admin.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';

import { ContactScoringWorker } from './scoring.worker';

const STALE_DAYS = 7;
const BATCH_SIZE = 200;

/**
 * Re-scoring nocturne des contacts non touchés depuis 7 jours.
 *
 * Tourne tous les jours à 02h00 UTC (équivalent ~02h Abidjan).
 * Utilise PrismaAdminService car balaye tous les tenants — la propagation du
 * contexte tenant est faite individuellement par contact avant le re-score.
 */
@Injectable()
export class ScoringScheduler {
  private readonly logger = new Logger(ScoringScheduler.name);

  constructor(
    private readonly prismaAdmin: PrismaAdminService,
    private readonly worker: ContactScoringWorker,
    private readonly tenantCtx: TenantContextService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'contacts.rescore_stale' })
  async rescoreStale(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    this.logger.log(`Re-scoring nocturne : contacts non scorés depuis ${cutoff.toISOString()}`);

    let processed = 0;
    let cursor: string | null = null;
    let batchCount = 0;

    while (batchCount < 50) {
      // Sécurité : max 10 000 contacts par exécution
      const batch: Array<{ id: string; agence_id: string }> = await this.prismaAdmin.contact.findMany({
        where: {
          archived_at: null,
          OR: [{ score_updated_at: null }, { score_updated_at: { lt: cutoff } }],
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, agence_id: true },
      });

      if (batch.length === 0) break;

      for (const c of batch) {
        await this.tenantCtx.run(c.agence_id, () => this.worker.rescore(c.id, null, null));
        processed++;
      }
      cursor = batch[batch.length - 1]!.id;
      batchCount++;
    }

    this.logger.log(`Re-scoring nocturne terminé : ${processed} contacts traités`);
  }
}
