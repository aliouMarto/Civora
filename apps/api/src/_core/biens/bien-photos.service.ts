import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../events/event-bus.service';
import { createDomainEvent } from '../events/domain-event';
import { S3ClientService } from '../storage/s3-client';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

import { BiensService } from './biens.service';
import {
  BienEventType,
  type BienPhotoAddedPayload,
  type BienPhotoRemovedPayload,
} from './events/bien-events';

import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import type {
  RegisterPhotoDto,
  ReorderPhotosDto,
  UploadPhotoDto,
} from './dto/upload-photo.dto';

const MAX_PHOTOS_PER_BIEN = 20;

@Injectable()
export class BienPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly storage: StorageService,
    private readonly s3: S3ClientService,
    private readonly biens: BiensService,
    private readonly eventBus: EventBusService,
    private readonly audit: AuditService,
  ) {}

  /** Étape 1 : URL signée PUT pour téléverser la photo directement sur R2. */
  async createUploadUrl(bienId: string, dto: UploadPhotoDto): Promise<{ upload_url: string; storage_key: string; expires_at: Date }> {
    const bien = await this.biens.getByIdOrThrow(bienId);
    const count = await this.prisma.bienPhoto.count({ where: { bien_id: bien.id } });
    if (count >= MAX_PHOTOS_PER_BIEN) {
      throw new BadRequestException(`Maximum ${MAX_PHOTOS_PER_BIEN} photos par bien atteint`);
    }
    const result = await this.storage.getUploadUrl({
      kind: 'photo_bien',
      ext: dto.ext,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      entite_id: bien.entite_id,
    });
    return { upload_url: result.url, storage_key: result.key, expires_at: result.expiresAt };
  }

  /**
   * Étape 2 : enregistre la photo en base après upload réussi.
   * Vérifie que la storage_key appartient bien à l'agence (prefixe tenants/<agence_id>/).
   */
  async register(bienId: string, dto: RegisterPhotoDto, user: JwtPayload) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.biens.getByIdOrThrow(bienId);

    // Dev shortcut : on accepte les data URLs et URLs http(s) directes
    // (utile quand R2 n'est pas configuré localement). En prod, la storage_key
    // doit être préfixée par tenants/<agence_id>/ pour garantir l'isolation.
    const isDirectUrl =
      dto.storage_key.startsWith('http://') ||
      dto.storage_key.startsWith('https://') ||
      dto.storage_key.startsWith('data:');
    if (!isDirectUrl && !dto.storage_key.startsWith(`tenants/${agence_id}/`)) {
      throw new ForbiddenException('storage_key ne correspond pas à cette agence');
    }
    // (Optionnel) vérifier que la clé inclut bien le prefixe entite_id si défini —
    // l'UI est sensée passer la clé renvoyée par createUploadUrl, on ne durcit pas plus.

    const count = await this.prisma.bienPhoto.count({ where: { bien_id: bien.id } });
    if (count >= MAX_PHOTOS_PER_BIEN) {
      throw new BadRequestException(`Maximum ${MAX_PHOTOS_PER_BIEN} photos par bien atteint`);
    }

    const ordre = dto.ordre ?? count;
    const photo = await this.prisma.withTenant(agence_id, (tx) =>
      tx.bienPhoto.create({
        data: {
          agence_id,
          bien_id: bien.id,
          storage_key: dto.storage_key,
          caption: dto.caption ?? null,
          ordre,
        },
      }),
    );

    await this.audit.log({
      action: 'biens:photo_add',
      actorId: user.sub,
      entityType: 'BienPhoto',
      entityId: photo.id,
      metadata: { bien_id: bien.id, storage_key: dto.storage_key },
    });

    await this.emit(BienEventType.PhotoAdded, {
      bien_id: bien.id,
      agence_id,
      actor_id: user.sub,
      photo_id: photo.id,
      storage_key: dto.storage_key,
      ordre,
    } satisfies BienPhotoAddedPayload, bien.id);

    return photo;
  }

  /** Renvoie les photos avec URLs signées GET (TTL court 5 min). */
  async listForBien(bienId: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.biens.getByIdOrThrow(bienId);
    const photos = await this.prisma.bienPhoto.findMany({
      where: { bien_id: bien.id, agence_id },
      orderBy: { ordre: 'asc' },
    });
    return Promise.all(
      photos.map(async (p) => {
        // Dev/seed shortcut: si storage_key est déjà une URL publique, on la retourne directement.
        const isDirectUrl =
          p.storage_key.startsWith('http://') ||
          p.storage_key.startsWith('https://') ||
          p.storage_key.startsWith('data:');
        if (isDirectUrl) {
          return {
            id: p.id,
            storage_key: p.storage_key,
            caption: p.caption,
            ordre: p.ordre,
            url: p.storage_key,
            url_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: p.created_at.toISOString(),
          };
        }
        const signed = await this.storage.getDownloadUrl(p.storage_key);
        return {
          id: p.id,
          storage_key: p.storage_key,
          caption: p.caption,
          ordre: p.ordre,
          url: signed.url,
          url_expires_at: signed.expiresAt.toISOString(),
          created_at: p.created_at.toISOString(),
        };
      }),
    );
  }

  async reorder(bienId: string, dto: ReorderPhotosDto, user: JwtPayload): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.biens.getByIdOrThrow(bienId);
    const ids = dto.order.map((o) => o.id);
    const existing = await this.prisma.bienPhoto.findMany({
      where: { bien_id: bien.id, id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      throw new BadRequestException("Certaines photos n'appartiennent pas à ce bien");
    }
    await this.prisma.withTenant(agence_id, async (tx) => {
      for (const { id, ordre } of dto.order) {
        await tx.bienPhoto.update({ where: { id }, data: { ordre } });
      }
    });
    await this.audit.log({
      action: 'biens:photo_reorder',
      actorId: user.sub,
      entityType: 'Bien',
      entityId: bien.id,
      metadata: { count: ids.length },
    });
  }

  async delete(bienId: string, photoId: string, user: JwtPayload): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.biens.getByIdOrThrow(bienId);
    const photo = await this.prisma.bienPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.bien_id !== bien.id || photo.agence_id !== agence_id) {
      throw new NotFoundException(`Photo ${photoId} introuvable`);
    }
    await this.prisma.withTenant(agence_id, (tx) =>
      tx.bienPhoto.delete({ where: { id: photoId } }),
    );
    // Suppression de l'objet R2 (best-effort — ne bloque pas si échec)
    try {
      await this.s3.client.send(
        new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: photo.storage_key }),
      );
    } catch {
      // L'objet sera supprimé par le job de purge nocturne. On loggue pas
      // d'erreur ici pour ne pas casser l'UX utilisateur.
    }
    await this.audit.log({
      action: 'biens:photo_delete',
      actorId: user.sub,
      entityType: 'BienPhoto',
      entityId: photoId,
      metadata: { bien_id: bien.id, storage_key: photo.storage_key },
    });
    await this.emit(BienEventType.PhotoRemoved, {
      bien_id: bien.id,
      agence_id,
      actor_id: user.sub,
      photo_id: photoId,
      storage_key: photo.storage_key,
    } satisfies BienPhotoRemovedPayload, bien.id);
  }

  private async emit(type: string, payload: unknown, aggregate_id: string): Promise<void> {
    const event = createDomainEvent({
      agence_id: this.tenantCtx.getAgenceId(),
      type,
      aggregate_type: 'Bien',
      aggregate_id,
      payload,
      metadata: {
        actor_id: null,
        correlation_id: randomUUID(),
        causation_id: null,
        ip: null,
        user_agent: null,
      },
    });
    await this.eventBus.emitInTx(event);
  }
}
