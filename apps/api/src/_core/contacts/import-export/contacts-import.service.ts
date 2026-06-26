import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validate as classValidate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import Papa from 'papaparse';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { QueueManagerService } from '../../jobs/queue-manager.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { S3ClientService } from '../../storage/s3-client';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';

import { ContactsDedupService } from '../contacts-dedup.service';
import { CreateContactDto } from '../dto/create-contact.dto';
import { normalizePhone, tryNormalizePhone } from '../normalizers/phone.normalizer';
import { normalizeEmail } from '../normalizers/email.normalizer';

import {
  inverseMapping,
  mapRowToDto,
  suggestMapping,
  type SupportedField,
} from './column-mapping';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo
const SYNC_PREVIEW_ROWS = 50;            // pour preview, on lit jusqu'à 50 lignes
const PREVIEW_VALIDATE_FIRST = 5;        // mais on valide seulement les 5 premières (UX)

export interface ImportUploadResponse {
  upload_url: string;
  file_key: string;
  expires_at: Date;
}

export interface ImportPreviewInput {
  file_key: string;
  mapping?: Partial<Record<SupportedField, string>>;
  options?: ImportOptions;
}

export interface ImportPreviewResponse {
  headers: string[];
  suggested_mapping: Partial<Record<SupportedField, string>>;
  preview_rows: Array<{ row: number; data: Record<string, unknown>; errors: string[] }>;
  total_rows_estimated: number;
}

export interface ImportOptions {
  skip_duplicates?: boolean;
  update_duplicates?: boolean;
  default_source?: string;
  default_roles?: string[];
}

export interface ImportExecuteInput {
  file_key: string;
  mapping: Partial<Record<SupportedField, string>>;
  options?: ImportOptions;
}

@Injectable()
export class ContactsImportService {
  private readonly logger = new Logger(ContactsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly storage: StorageService,
    private readonly s3: S3ClientService,
    private readonly queue: QueueManagerService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly dedup: ContactsDedupService,
  ) {}

  /**
   * Étape 1 : retourner une URL PUT signée pour téléverser le fichier.
   * Le frontend uploade directement sur R2, jamais à travers l'API
   * (évite de charger 50 Mo en mémoire Node).
   */
  async createUploadUrl(params: { ext: string; contentType: string; sizeBytes?: number }): Promise<ImportUploadResponse> {
    if (params.sizeBytes && params.sizeBytes > MAX_FILE_BYTES) {
      throw new BadRequestException(`Fichier trop volumineux (max ${MAX_FILE_BYTES / 1024 / 1024} Mo)`);
    }
    const result = await this.storage.getUploadUrl({
      kind: 'temp',
      ext: params.ext,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
    });
    return { upload_url: result.url, file_key: result.key, expires_at: result.expiresAt };
  }

  /**
   * Étape 2 : aperçu. Lit la tête du fichier, propose un mapping, valide
   * les premières lignes sans rien écrire. Synchrone, pas de worker.
   */
  async preview(input: ImportPreviewInput): Promise<ImportPreviewResponse> {
    const agence_id = this.tenantCtx.requireAgenceId();
    if (!input.file_key.startsWith(`tenants/${agence_id}/`)) {
      throw new ForbiddenException('Le fichier ne correspond pas à cette agence');
    }

    const csv = await this.downloadAsString(input.file_key);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      preview: SYNC_PREVIEW_ROWS,
    });

    const headers = parsed.meta.fields ?? [];
    const sample = parsed.data.slice(0, SYNC_PREVIEW_ROWS);
    const suggestion = suggestMapping(headers, sample);

    const mapping = { ...suggestion.mapping, ...input.mapping };
    const inverse = inverseMapping(mapping);

    const preview_rows = await Promise.all(
      sample.slice(0, PREVIEW_VALIDATE_FIRST).map(async (raw, i) => {
        const dto = mapRowToDto(raw, inverse);
        if (input.options?.default_source && !dto['source']) dto['source'] = input.options.default_source;
        if (input.options?.default_roles && !dto['roles']) dto['roles'] = input.options.default_roles;
        const errors = await this.validateRow(dto);
        return { row: i + 2, data: dto, errors }; // +2 car ligne 1 = header, 0-indexé
      }),
    );

    // Estimation totale : compter les retours à la ligne moins l'entête
    const total_rows_estimated = Math.max(0, csv.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1);

    return {
      headers,
      suggested_mapping: suggestion.mapping,
      preview_rows,
      total_rows_estimated,
    };
  }

  /**
   * Étape 3 : enfile le job d'import. La validation et l'écriture
   * sont effectuées par le worker (tenant context positionné).
   */
  async execute(input: ImportExecuteInput, userId: string): Promise<{ import_job_id: string }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    if (!input.file_key.startsWith(`tenants/${agence_id}/`)) {
      throw new ForbiddenException('Le fichier ne correspond pas à cette agence');
    }
    if (Object.keys(input.mapping).length === 0) {
      throw new BadRequestException('Aucun mapping de colonnes fourni');
    }

    const job = await this.prisma.withTenant(agence_id, (tx) =>
      tx.importJob.create({
        data: {
          agence_id,
          module: 'contacts',
          fichier_key: input.file_key,
          mapping: input.mapping as object,
          options: (input.options ?? {}) as object,
          status: 'queued',
          created_by: userId,
        },
      }),
    );

    await this.queue.add('imports', 'contacts.import', {
      agence_id,
      actor_id: userId,
      correlation_id: randomUUID(),
      import_job_id: job.id,
      module: 'contacts',
      fichier_key: input.file_key,
      mapping: input.mapping as Record<string, string>,
      options: input.options ?? {},
    });

    await this.audit.log({
      action: 'contacts:import.started',
      actorId: userId,
      entityType: 'ImportJob',
      entityId: job.id,
      metadata: { module: 'contacts', file_key: input.file_key, mapping_keys: Object.keys(input.mapping) },
    });

    return { import_job_id: job.id };
  }

  async getStatus(importJobId: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const job = await this.prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job || job.agence_id !== agence_id) {
      throw new NotFoundException(`ImportJob ${importJobId} introuvable`);
    }
    return job;
  }

  async getErrorsDownloadUrl(importJobId: string): Promise<{ url: string; expires_at: Date }> {
    const job = await this.getStatus(importJobId);
    if (!job.errors_file_key) {
      throw new NotFoundException('Pas de fichier d\'erreurs pour cet import');
    }
    return this.storage.getDownloadUrl(job.errors_file_key);
  }

  // ─── Helpers (utilisés aussi par le worker) ────────────────────────────────

  async downloadAsString(key: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.s3.bucket, Key: key });
    const res = await this.s3.client.send(cmd);
    if (!res.Body) return '';
    return await streamToString(res.Body as unknown as Readable);
  }

  async validateRow(dto: Record<string, unknown>): Promise<string[]> {
    // Normalisations qui ne devraient pas faire échouer la validation
    if (typeof dto['telephone'] === 'string') {
      const norm = tryNormalizePhone(dto['telephone']);
      if (norm) dto['telephone'] = norm;
    }
    if (typeof dto['whatsapp'] === 'string') {
      const norm = tryNormalizePhone(dto['whatsapp']);
      if (norm) dto['whatsapp'] = norm;
    }
    if (typeof dto['email'] === 'string') {
      dto['email'] = normalizeEmail(dto['email']);
    }

    const instance = plainToInstance(CreateContactDto, dto);
    const errors = await classValidate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));

    // Invariant métier supplémentaire : au moins un canal
    const hasEmail = typeof dto['email'] === 'string' && (dto['email'] as string).length > 0;
    const hasPhone = typeof dto['telephone'] === 'string' && (dto['telephone'] as string).length > 0;
    if (!hasEmail && !hasPhone) {
      messages.push('email OU telephone est requis');
    }
    return messages;
  }

  /** Convertit un objet stocké en S3/R2 en string. */
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c: Buffer | string) =>
      chunks.push(typeof c === 'string' ? Buffer.from(c) : c),
    );
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Utilitaire partagé : upload d'un buffer sur R2.
 * Utilisé par les workers pour pousser le CSV des erreurs ou l'export final.
 */
export async function uploadBuffer(
  s3: S3ClientService,
  key: string,
  contentType: string,
  body: Buffer | string,
): Promise<void> {
  await s3.client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: contentType,
      Body: body,
    }),
  );
}

/** URL signée GET, 24h. */
export async function signGetUrl(s3: S3ClientService, key: string): Promise<{ url: string; expires_at: Date }> {
  const url = await getSignedUrl(
    s3.client,
    new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
    { expiresIn: 24 * 60 * 60 },
  );
  return { url, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) };
}
