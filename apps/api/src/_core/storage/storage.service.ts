import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { buildObjectKey, keyBelongsToAgence, type StorageKind } from './object-key';
import { S3ClientService } from './s3-client';
import {
  STORAGE_POLICIES,
  validateContentType,
  validateFileSize,
} from './storage-policy';

const PRESIGN_EXPIRES_SECONDS = 5 * 60; // 5 min

export interface UploadUrlResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface DownloadUrlResult {
  url: string;
  expiresAt: Date;
}

export interface GetUploadUrlParams {
  kind: StorageKind;
  ext: string;
  contentType: string;
  sizeBytes?: number;
  entite_id?: string | null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly s3: S3ClientService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  /**
   * Génère une URL signée PUT pour l'upload direct depuis le client vers R2/MinIO.
   * Valide le contentType et la taille max selon la politique du kind.
   */
  async getUploadUrl(params: GetUploadUrlParams): Promise<UploadUrlResult> {
    const { kind, ext, contentType, sizeBytes, entite_id } = params;
    const agence_id = this.tenantCtx.requireAgenceId();

    this.validateKind(kind);
    this.validateContentTypeOrThrow(kind, contentType);
    if (sizeBytes !== undefined) this.validateSizeOrThrow(kind, sizeBytes);

    const key = buildObjectKey({ agence_id, entite_id, kind, ext });
    const expiresAt = new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000);

    const command = new PutObjectCommand({
      Bucket: this.s3.bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.s3.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    this.logger.log(`upload-url-generated: ${kind}/${key} (agence=${agence_id})`);

    return { url, key, expiresAt };
  }

  /**
   * Génère une URL signée GET pour le téléchargement.
   * Vérifie que la clé appartient à l'agence courante avant de signer.
   */
  async getDownloadUrl(key: string): Promise<DownloadUrlResult> {
    const agence_id = this.tenantCtx.requireAgenceId();

    if (!keyBelongsToAgence(key, agence_id)) {
      this.logger.warn(
        `download-url-refused: key="${key}" ne appartient pas à agence=${agence_id}`,
      );
      throw new ForbiddenException('Access denied to this object');
    }

    const expiresAt = new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000);

    const command = new GetObjectCommand({
      Bucket: this.s3.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    this.logger.log(`download-url-generated: key=${key} (agence=${agence_id})`);

    return { url, expiresAt };
  }

  /**
   * Supprime un objet. Vérifie l'appartenance tenant avant suppression.
   */
  async delete(key: string): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();

    if (!keyBelongsToAgence(key, agence_id)) {
      throw new ForbiddenException('Access denied to this object');
    }

    await this.s3.client.send(
      new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: key }),
    );

    this.logger.log(`object-deleted: key=${key} (agence=${agence_id})`);
  }

  /**
   * Vérifie l'existence et les métadonnées d'un objet (sans télécharger).
   */
  async head(key: string): Promise<{ contentType?: string; contentLength?: number }> {
    const agence_id = this.tenantCtx.requireAgenceId();

    if (!keyBelongsToAgence(key, agence_id)) {
      throw new ForbiddenException('Access denied to this object');
    }

    const result = await this.s3.client.send(
      new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key }),
    );

    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  }

  // ─── Validation helpers ───────────────────────────────────────────────────

  private validateKind(kind: string): void {
    if (!(kind in STORAGE_POLICIES)) {
      throw new BadRequestException(`Kind "${kind}" non supporté`);
    }
  }

  private validateContentTypeOrThrow(kind: StorageKind, contentType: string): void {
    if (!validateContentType(kind, contentType)) {
      const allowed = STORAGE_POLICIES[kind].allowedContentTypes.join(', ');
      throw new BadRequestException(
        `contentType "${contentType}" non autorisé pour kind "${kind}". Autorisés: ${allowed}`,
      );
    }
  }

  private validateSizeOrThrow(kind: StorageKind, sizeBytes: number): void {
    if (!validateFileSize(kind, sizeBytes)) {
      const maxMb = STORAGE_POLICIES[kind].maxSizeBytes / (1024 * 1024);
      throw new BadRequestException(
        `Fichier trop volumineux pour kind "${kind}". Maximum: ${maxMb} Mo`,
      );
    }
  }
}
