import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import type { Env } from '../../../../infrastructure/config/env.schema';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { BaseWorkerService } from '../../../jobs/base-worker.service';
import { DeadLetterService } from '../../../jobs/dead-letter.service';
import type { ExportContactsPayload } from '../../../jobs/job-types';
import type { QueueName } from '../../../jobs/queues.config';
import { RealtimeService } from '../../../realtime/realtime.service';
import { S3ClientService } from '../../../storage/s3-client';
import { TenantContextService } from '../../../tenancy/tenant-context.service';

import { ContactsExportService } from '../contacts-export.service';
import { uploadBuffer } from '../contacts-import.service';

@Injectable()
export class ContactsExportWorker extends BaseWorkerService<ExportContactsPayload> {
  protected readonly queueName: QueueName = 'exports';

  constructor(
    config: ConfigService<Env, true>,
    tenantCtx: TenantContextService,
    deadLetter: DeadLetterService,
    private readonly prisma: PrismaService,
    private readonly s3: S3ClientService,
    private readonly exportService: ContactsExportService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {
    super(config, tenantCtx, deadLetter);
  }

  async process(job: Job<ExportContactsPayload>): Promise<{ key: string; rows: number }> {
    const { export_job_id, format, filtres, columns, agence_id, actor_id } = job.data;
    if (!agence_id) throw new Error('agence_id manquant');

    await this.prisma.exportJob.update({
      where: { id: export_job_id },
      data: { status: 'running' },
    });

    try {
      const built = this.exportService.buildFilters(filtres as never);
      // En async, on accepte d'aller au-delà de SYNC_THRESHOLD : on stream
      // par paquets de 500 lignes pour limiter la mémoire.
      const PAGE = 500;
      const allRows: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      // boucle de pagination par PK uuid descendant via cursor Prisma
      // (l'auto-extension RLS gère le contexte tenant)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = (await this.prisma.contact.findMany({
          where: built.whereForCount,
          take: PAGE + 1,
          orderBy: { created_at: 'desc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })) as Record<string, unknown>[];
        if (batch.length === 0) break;
        const hasMore = batch.length > PAGE;
        const slice = hasMore ? batch.slice(0, PAGE) : batch;
        allRows.push(...slice);
        if (!hasMore) break;
        cursor = (slice[slice.length - 1]!['id'] as string);

        // Progression realtime ~ tous les paquets
        if (actor_id) {
          this.realtime.emitToUser(actor_id, 'contacts.export.progress', {
            export_job_id,
            rows: allRows.length,
          });
        }
      }

      const cols = (columns ?? null) ?? [];
      const buffer = await this.exportService.serializeAsync(allRows, cols, format);
      const key = `tenants/${agence_id}/temp/export-${export_job_id}.${format}`;
      await uploadBuffer(this.s3, key, this.exportService.contentType(format), buffer);

      await this.prisma.exportJob.update({
        where: { id: export_job_id },
        data: {
          status: 'completed',
          fichier_key: key,
          total_rows: allRows.length,
          finished_at: new Date(),
        },
      });

      await this.audit.log({
        action: 'contacts:export.generated',
        actorId: actor_id ?? null,
        entityType: 'ExportJob',
        entityId: export_job_id,
        metadata: { format, count: allRows.length, mode: 'async' },
      });

      if (actor_id) {
        this.realtime.emitToUser(actor_id, 'contacts.export.completed', {
          export_job_id,
          rows: allRows.length,
        });
      }

      return { key, rows: allRows.length };
    } catch (err) {
      await this.prisma.exportJob.update({
        where: { id: export_job_id },
        data: { status: 'failed', error_message: (err as Error).message, finished_at: new Date() },
      });
      throw err;
    }
  }
}
