import { randomUUID } from 'node:crypto';

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { QueueManagerService } from '../../jobs/queue-manager.service';
import { S3ClientService } from '../../storage/s3-client';
import { TenantContextService } from '../../tenancy/tenant-context.service';

import { ContactsRepository, type ContactListFilters } from '../contacts.repository';
import type { ContactSort } from '@civora/shared-types';

import { signGetUrl, uploadBuffer } from './contacts-import.service';

/** Au-delà de ce seuil, l'export bascule en mode asynchrone (worker). */
const SYNC_THRESHOLD = 1000;

export const DEFAULT_EXPORT_COLUMNS = [
  'id',
  'nom',
  'prenom',
  'email',
  'telephone',
  'whatsapp',
  'whatsapp_opt_in',
  'ville',
  'commune',
  'pays',
  'roles',
  'source',
  'tags',
  'score_ia',
  'score_categorie',
  'segments_ia',
  'created_at',
  'derniere_interaction_at',
] as const;
export type ExportColumn = (typeof DEFAULT_EXPORT_COLUMNS)[number];

export interface ExportRequest {
  format: 'csv' | 'xlsx';
  filtres?: Partial<ContactListFilters>;
  columns?: ExportColumn[];
}

export interface ExportSyncResult {
  mode: 'sync';
  filename: string;
  content_type: string;
  body: Buffer;
}

export interface ExportAsyncResult {
  mode: 'async';
  export_job_id: string;
}

@Injectable()
export class ContactsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly repo: ContactsRepository,
    private readonly queue: QueueManagerService,
    private readonly s3: S3ClientService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lance l'export. Retourne directement le fichier si volume < 1000,
   * sinon retourne un job_id (à poller via getStatus).
   */
  async start(req: ExportRequest, userId: string): Promise<ExportSyncResult | ExportAsyncResult> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const filters = this.buildFilters(req.filtres);

    const count = await this.prisma.contact.count({ where: filters.whereForCount });
    const columns = req.columns ?? [...DEFAULT_EXPORT_COLUMNS];

    if (count <= SYNC_THRESHOLD) {
      const rows = await this.fetchAll(filters);
      const body = await this.serializeAsync(rows, columns, req.format);
      const filename = `contacts-${new Date().toISOString().slice(0, 10)}.${req.format}`;
      await this.audit.log({
        action: 'contacts:export.generated',
        actorId: userId,
        entityType: 'Contact',
        metadata: { format: req.format, count: rows.length, mode: 'sync' },
      });
      return {
        mode: 'sync',
        filename,
        content_type: this.contentType(req.format),
        body,
      };
    }

    // Mode async
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const job = await this.prisma.withTenant(agence_id, (tx) =>
      tx.exportJob.create({
        data: {
          agence_id,
          module: 'contacts',
          format: req.format,
          filtres: (req.filtres ?? {}) as object,
          columns: columns as object,
          total_rows: count,
          status: 'queued',
          created_by: userId,
          expires_at: expires,
        },
      }),
    );

    await this.queue.add('exports', 'contacts.export', {
      agence_id,
      actor_id: userId,
      correlation_id: randomUUID(),
      export_job_id: job.id,
      module: 'contacts',
      format: req.format,
      filtres: (req.filtres ?? {}) as Record<string, unknown>,
      columns,
    });

    await this.audit.log({
      action: 'contacts:export.queued',
      actorId: userId,
      entityType: 'ExportJob',
      entityId: job.id,
      metadata: { format: req.format, count, mode: 'async' },
    });

    return { mode: 'async', export_job_id: job.id };
  }

  async getStatus(exportJobId: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const job = await this.prisma.exportJob.findUnique({ where: { id: exportJobId } });
    if (!job || job.agence_id !== agence_id) {
      throw new NotFoundException(`ExportJob ${exportJobId} introuvable`);
    }
    if (job.expires_at < new Date()) {
      throw new ForbiddenException('Ce fichier d\'export a expiré (24h max)');
    }
    let download_url: string | null = null;
    let expires_at: Date | null = null;
    if (job.status === 'completed' && job.fichier_key) {
      const signed = await signGetUrl(this.s3, job.fichier_key);
      download_url = signed.url;
      expires_at = signed.expires_at;
    }
    return { job, download_url, expires_at };
  }

  // ─── Helpers (utilisés aussi par le worker) ────────────────────────────────

  buildFilters(filtres?: Partial<ContactListFilters>): {
    full: ContactListFilters;
    whereForCount: Record<string, unknown>;
  } {
    const agence_id = this.tenantCtx.requireAgenceId();
    const sort: ContactSort = filtres?.sort ?? 'created_at_desc';
    const full: ContactListFilters = {
      agence_id,
      limit: SYNC_THRESHOLD,
      sort,
      ...filtres,
      // forcer l'agence
    };
    const whereForCount: Record<string, unknown> = { agence_id };
    if (!filtres?.include_archived) whereForCount['archived_at'] = null;
    if (filtres?.role && filtres.role.length > 0) whereForCount['roles'] = { hasEvery: filtres.role };
    if (filtres?.score_categorie) whereForCount['score_categorie'] = filtres.score_categorie;
    if (filtres?.ville) whereForCount['ville'] = filtres.ville;
    if (filtres?.source) whereForCount['source'] = filtres.source;
    return { full, whereForCount };
  }

  /** Charge tous les contacts qui matchent — sans pagination cursor (export). */
  async fetchAll(filters: ReturnType<ContactsExportService['buildFilters']>): Promise<Record<string, unknown>[]> {
    // En sync (< 1000), un seul SELECT suffit ; l'auto-extension RLS de
    // PrismaService garantit le contexte tenant.
    return this.prisma.contact.findMany({
      where: filters.whereForCount,
      take: SYNC_THRESHOLD,
      orderBy: { created_at: 'desc' },
    }) as Promise<Record<string, unknown>[]>;
  }

  async serializeAsync(
    rows: Record<string, unknown>[],
    columns: readonly string[],
    format: 'csv' | 'xlsx',
  ): Promise<Buffer> {
    const projected = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of columns) {
        const value = r[c];
        out[c] = Array.isArray(value) ? value.join(', ') : value ?? '';
      }
      return out;
    });
    if (format === 'csv') {
      const csv = Papa.unparse(projected, { columns: [...columns] });
      return Buffer.concat([Buffer.from('﻿', 'utf-8'), Buffer.from(csv, 'utf-8')]);
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contacts');
    ws.columns = columns.map((c) => ({ header: c, key: c, width: 18 }));
    ws.getRow(1).font = { bold: true };
    for (const r of projected) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  contentType(format: 'csv' | 'xlsx'): string {
    return format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}
