/**
 * Tests StorageService : URLs signées, validation, audit.
 * AWS SDK v3 est mocké — pas de MinIO réel nécessaire.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TenantContextService } from '../../tenancy/tenant-context.service';
import { StorageService } from '../storage.service';
import type { S3ClientService } from '../s3-client';

// ─── Mock @aws-sdk/s3-request-presigner ──────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/fake-url?sig=abc'),
}));

// ─── Mock commandes S3 ───────────────────────────────────────────────────────
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'PutObject' })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'GetObject' })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'DeleteObject' })),
  HeadObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'HeadObject' })),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSvc(agence_id: string | null = 'agence-abc') {
  const mockS3: Pick<S3ClientService, 'client' | 'bucket'> = {
    client: {
      send: vi.fn().mockResolvedValue({ ContentType: 'image/jpeg', ContentLength: 1024 }),
    } as never,
    bucket: 'civora-dev',
  };

  const mockTenantCtx = {
    requireAgenceId: vi.fn().mockImplementation(() => {
      if (!agence_id) throw new Error('No tenant');
      return agence_id;
    }),
    getAgenceId: vi.fn().mockReturnValue(agence_id),
  };

  const svc = new StorageService(
    mockS3 as S3ClientService,
    mockTenantCtx as unknown as TenantContextService,
  );

  return { svc, mockS3, mockTenantCtx };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StorageService.getUploadUrl()', () => {
  beforeEach(() => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://presigned.example.com/upload?sig=abc');
  });

  it('retourne une URL signée PUT avec clé et expiresAt', async () => {
    const { svc } = makeSvc();

    const result = await svc.getUploadUrl({
      kind: 'photo_bien',
      ext: 'jpg',
      contentType: 'image/jpeg',
    });

    expect(result.url).toContain('presigned.example.com');
    expect(result.key).toMatch(/^tenants\/agence-abc\/photo_bien\/\d{4}\/\d{2}\/[0-9a-f-]+\.jpg$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expire dans ~5 minutes (300s)', async () => {
    const { svc } = makeSvc();
    const before = Date.now();

    const result = await svc.getUploadUrl({
      kind: 'bail',
      ext: 'pdf',
      contentType: 'application/pdf',
    });

    const diffMs = result.expiresAt.getTime() - before;
    expect(diffMs).toBeGreaterThan(290_000);  // > 290s
    expect(diffMs).toBeLessThan(310_000);     // < 310s
  });

  it('inclut entite_id dans la clé si fourni', async () => {
    const { svc } = makeSvc();

    const result = await svc.getUploadUrl({
      kind: 'document_bien',
      ext: 'pdf',
      contentType: 'application/pdf',
      entite_id: 'entite-xyz',
    });

    expect(result.key).toContain('/entite-xyz/');
  });

  it('rejette un contentType non autorisé pour le kind → 400', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.getUploadUrl({ kind: 'bail', ext: 'jpg', contentType: 'image/jpeg' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette un contentType non autorisé avec message explicite', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.getUploadUrl({ kind: 'bail', ext: 'jpg', contentType: 'image/jpeg' }),
    ).rejects.toThrow(/non autorisé/);
  });

  it('rejette si sizeBytes dépasse le maximum du kind → 400', async () => {
    const { svc } = makeSvc();
    const tooBig = 25 * 1024 * 1024; // 25 Mo > max bail (20 Mo)

    await expect(
      svc.getUploadUrl({
        kind: 'bail',
        ext: 'pdf',
        contentType: 'application/pdf',
        sizeBytes: tooBig,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un fichier dans la limite de taille', async () => {
    const { svc } = makeSvc();
    const ok = 5 * 1024 * 1024; // 5 Mo < max bail (20 Mo)

    await expect(
      svc.getUploadUrl({
        kind: 'bail',
        ext: 'pdf',
        contentType: 'application/pdf',
        sizeBytes: ok,
      }),
    ).resolves.toHaveProperty('key');
  });

  it('rejette un kind inconnu → 400', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.getUploadUrl({ kind: 'inconnu' as never, ext: 'xyz', contentType: 'application/octet-stream' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('StorageService.getDownloadUrl()', () => {
  beforeEach(() => {
    vi.mocked(getSignedUrl).mockResolvedValue('https://presigned.example.com/download?sig=xyz');
  });

  it('retourne une URL signée pour une clé appartenant à l\'agence', async () => {
    const { svc } = makeSvc('agence-abc');

    const result = await svc.getDownloadUrl(
      'tenants/agence-abc/photo_bien/2025/06/uuid.jpg',
    );

    expect(result.url).toContain('presigned.example.com');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('refuse une clé d\'une autre agence → 403 (isolation inter-tenant)', async () => {
    const { svc } = makeSvc('agence-abc');

    await expect(
      svc.getDownloadUrl('tenants/agence-AUTRE/photo_bien/2025/06/uuid.jpg'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 même si la clé est un préfixe partiel valide', async () => {
    const { svc } = makeSvc('agence-abc');

    await expect(
      // "agence-abc-evil" commence par "agence-abc" mais n'est pas la même agence
      svc.getDownloadUrl('tenants/agence-abc-evil/photo_bien/2025/06/uuid.jpg'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('StorageService.delete()', () => {
  it('supprime un objet appartenant à l\'agence', async () => {
    const { svc, mockS3 } = makeSvc('agence-abc');

    await svc.delete('tenants/agence-abc/photo_bien/2025/06/uuid.jpg');

    expect(mockS3.client.send).toHaveBeenCalledOnce();
  });

  it('refuse la suppression d\'un objet d\'une autre agence → 403', async () => {
    const { svc } = makeSvc('agence-abc');

    await expect(
      svc.delete('tenants/agence-AUTRE/photo_bien/2025/06/uuid.jpg'),
    ).rejects.toThrow(ForbiddenException);
  });
});
