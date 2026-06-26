import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import Papa from 'papaparse';

import type { Env } from '../../../../infrastructure/config/env.schema';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { EventBusService } from '../../../events/event-bus.service';
import { createDomainEvent } from '../../../events/domain-event';
import { BaseWorkerService } from '../../../jobs/base-worker.service';
import { DeadLetterService } from '../../../jobs/dead-letter.service';
import type { ImportContactsPayload } from '../../../jobs/job-types';
import type { QueueName } from '../../../jobs/queues.config';
import { RealtimeService } from '../../../realtime/realtime.service';
import { S3ClientService } from '../../../storage/s3-client';
import { TenantContextService } from '../../../tenancy/tenant-context.service';

import { ContactsDedupService } from '../../contacts-dedup.service';
import { ContactEventType, type ContactCreatedPayload } from '../../events/contact-events';
import { normalizeEmail } from '../../normalizers/email.normalizer';
import { tryNormalizePhone } from '../../normalizers/phone.normalizer';

import { inverseMapping, mapRowToDto } from '../column-mapping';
import {
  ContactsImportService,
  signGetUrl,
  uploadBuffer,
} from '../contacts-import.service';

const PROGRESS_BATCH = 100;
const CHUNK_SIZE = 500;

interface ErrorRow {
  ligne: number;
  erreur: string;
  email?: string;
  telephone?: string;
  nom?: string;
}

@Injectable()
export class ContactsImportWorker extends BaseWorkerService<ImportContactsPayload> {
  protected readonly queueName: QueueName = 'imports';

  constructor(
    config: ConfigService<Env, true>,
    tenantCtx: TenantContextService,
    deadLetter: DeadLetterService,
    private readonly prisma: PrismaService,
    private readonly s3: S3ClientService,
    private readonly importService: ContactsImportService,
    private readonly dedup: ContactsDedupService,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {
    super(config, tenantCtx, deadLetter);
  }

  async process(job: Job<ImportContactsPayload>): Promise<{ imported: number; skipped: number; errors: number }> {
    const { import_job_id, fichier_key, mapping, options, agence_id, actor_id } = job.data;
    if (!agence_id) throw new Error('agence_id manquant dans le payload du job');

    await this.markRunning(import_job_id);

    const csv = await this.importService.downloadAsString(fichier_key);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const totalRows = parsed.data.length;

    await this.prisma.importJob.update({
      where: { id: import_job_id },
      data: { total_rows: totalRows },
    });

    const inverse = inverseMapping(mapping as never);
    const errors: ErrorRow[] = [];
    let imported = 0;
    let skipped = 0;
    let processed = 0;

    // Traitement par chunks pour limiter la mémoire et permettre la progression
    for (let start = 0; start < parsed.data.length; start += CHUNK_SIZE) {
      const chunk = parsed.data.slice(start, start + CHUNK_SIZE);
      for (let i = 0; i < chunk.length; i++) {
        const lineNo = start + i + 2; // +2 : header + 0-indexé
        const raw = chunk[i]!;
        const dto = mapRowToDto(raw, inverse);

        if (options.default_source && !dto['source']) dto['source'] = options.default_source;
        if (options.default_roles && !dto['roles']) dto['roles'] = options.default_roles;

        try {
          const result = await this.importOne(dto, options, agence_id, actor_id ?? null);
          if (result === 'imported') imported++;
          else skipped++;
        } catch (err) {
          errors.push({
            ligne: lineNo,
            erreur: (err as Error).message,
            email: typeof dto['email'] === 'string' ? (dto['email'] as string) : undefined,
            telephone: typeof dto['telephone'] === 'string' ? (dto['telephone'] as string) : undefined,
            nom: typeof dto['nom'] === 'string' ? (dto['nom'] as string) : undefined,
          });
        }

        processed++;
        if (processed % PROGRESS_BATCH === 0) {
          await this.publishProgress(import_job_id, processed, imported, skipped, errors.length, totalRows, actor_id ?? null);
        }
      }
    }

    // Upload du CSV d'erreurs (si erreurs)
    let errorsKey: string | null = null;
    if (errors.length > 0) {
      errorsKey = `tenants/${agence_id}/temp/import-errors-${import_job_id}.csv`;
      const csvOut = Papa.unparse(errors, { header: true });
      await uploadBuffer(this.s3, errorsKey, 'text/csv; charset=utf-8', csvOut);
    }

    await this.prisma.importJob.update({
      where: { id: import_job_id },
      data: {
        processed,
        imported,
        skipped,
        errors: errors.length,
        errors_file_key: errorsKey,
        status: 'completed',
        finished_at: new Date(),
      },
    });

    await this.publishProgress(import_job_id, processed, imported, skipped, errors.length, totalRows, actor_id ?? null, 'completed');

    await this.audit.log({
      action: 'contacts:import.completed',
      actorId: actor_id ?? null,
      entityType: 'ImportJob',
      entityId: import_job_id,
      metadata: {
        total: totalRows,
        imported,
        skipped,
        errors: errors.length,
        file_key: fichier_key,
      },
    });

    return { imported, skipped, errors: errors.length };
  }

  /**
   * Importe une ligne : applique la validation DTO, gère le dédoublonnage.
   * Renvoie 'imported' si une création/mise à jour a eu lieu, 'skipped' sinon.
   * Throw si la ligne est invalide → ajout au rapport d'erreurs.
   */
  private async importOne(
    dto: Record<string, unknown>,
    options: ImportContactsPayload['options'],
    agence_id: string,
    actor_id: string | null,
  ): Promise<'imported' | 'skipped'> {
    if (typeof dto['email'] === 'string') dto['email'] = normalizeEmail(dto['email']);
    if (typeof dto['telephone'] === 'string') {
      const n = tryNormalizePhone(dto['telephone']);
      if (n) dto['telephone'] = n;
    }
    if (typeof dto['whatsapp'] === 'string') {
      const n = tryNormalizePhone(dto['whatsapp']);
      if (n) dto['whatsapp'] = n;
    }

    const errors = await this.importService.validateRow(dto);
    if (errors.length > 0) throw new Error(errors.join(' ; '));

    const conflict = await this.dedup.findHardConflict({
      agence_id,
      email: (dto['email'] as string | undefined) ?? undefined,
      telephone: (dto['telephone'] as string | undefined) ?? undefined,
    });

    if (conflict) {
      if (options.update_duplicates) {
        await this.prisma.withTenant(agence_id, (tx) =>
          tx.contact.update({
            where: { id: conflict.id },
            data: {
              prenom: (dto['prenom'] as string) ?? undefined,
              ville: (dto['ville'] as string) ?? undefined,
              commune: (dto['commune'] as string) ?? undefined,
              roles: Array.isArray(dto['roles']) ? (dto['roles'] as string[]) : undefined,
              tags: Array.isArray(dto['tags']) ? (dto['tags'] as string[]) : undefined,
              source: (dto['source'] as string) ?? undefined,
              whatsapp: (dto['whatsapp'] as string) ?? undefined,
              whatsapp_opt_in: typeof dto['whatsapp_opt_in'] === 'boolean' ? (dto['whatsapp_opt_in'] as boolean) : undefined,
            },
          }),
        );
        return 'imported';
      }
      if (options.skip_duplicates) return 'skipped';
      throw new Error(`Doublon : contact existant ${conflict.nom} (id=${conflict.id})`);
    }

    const created = await this.prisma.withTenant(agence_id, (tx) =>
      tx.contact.create({
        data: {
          agence_id,
          nom: dto['nom'] as string,
          prenom: (dto['prenom'] as string) ?? null,
          genre: (dto['genre'] as string) ?? null,
          langue: (dto['langue'] as string) ?? 'fr',
          email: (dto['email'] as string) ?? null,
          telephone: (dto['telephone'] as string) ?? null,
          whatsapp: (dto['whatsapp'] as string) ?? null,
          whatsapp_opt_in: typeof dto['whatsapp_opt_in'] === 'boolean' ? (dto['whatsapp_opt_in'] as boolean) : false,
          adresse_ligne1: (dto['adresse_ligne1'] as string) ?? null,
          adresse_ligne2: (dto['adresse_ligne2'] as string) ?? null,
          ville: (dto['ville'] as string) ?? null,
          commune: (dto['commune'] as string) ?? null,
          pays: (dto['pays'] as string) ?? 'CI',
          roles: Array.isArray(dto['roles']) ? (dto['roles'] as string[]) : [],
          source: (dto['source'] as string) ?? null,
          tags: Array.isArray(dto['tags']) ? (dto['tags'] as string[]) : [],
          created_by: actor_id,
        },
      }),
    );

    // Émet contact.created via outbox (sera consommé par le scoring worker)
    await this.eventBus.emitInTx(
      createDomainEvent({
        agence_id,
        type: ContactEventType.Created,
        aggregate_type: 'Contact',
        aggregate_id: created.id,
        payload: {
          contact_id: created.id,
          agence_id,
          actor_id,
          roles: created.roles,
          source: created.source,
          email_present: Boolean(created.email),
          telephone_present: Boolean(created.telephone),
        } satisfies ContactCreatedPayload,
        metadata: {
          actor_id,
          correlation_id: randomUUID(),
          causation_id: null,
          ip: null,
          user_agent: null,
        },
      }),
    );

    return 'imported';
  }

  private async markRunning(id: string): Promise<void> {
    await this.prisma.importJob.update({
      where: { id },
      data: { status: 'running', started_at: new Date() },
    });
  }

  private async publishProgress(
    id: string,
    processed: number,
    imported: number,
    skipped: number,
    errors: number,
    total: number,
    userId: string | null,
    status: 'running' | 'completed' = 'running',
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id },
      data: { processed, imported, skipped, errors },
    });
    if (userId) {
      this.realtime.emitToUser(userId, 'contacts.import.progress', {
        import_job_id: id,
        processed,
        imported,
        skipped,
        errors,
        total,
        percent: total > 0 ? Math.round((processed / total) * 100) : 0,
        status,
      });
    }
  }
}
