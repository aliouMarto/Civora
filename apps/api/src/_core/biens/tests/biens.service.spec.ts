/**
 * Tests unitaires de BiensService (validation métier + génération de référence).
 *
 * On stubbe les dépendances (PrismaService, repo, eventBus, audit, tenantCtx)
 * pour tester isolément la logique :
 *   - validation : usage=vente sans prix → 400
 *   - validation : usage=location sans loyer → 400
 *   - validation : lat sans lng → 400
 *   - reference auto-générée au format BIE-YYYY-NNNN avec séquence par agence
 *   - update : reference modifiée → 400
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { BiensService } from '../biens.service';
import type { CreateBienDto } from '../dto/create-bien.dto';
import type { JwtPayload } from '../../auth/decorators/current-user.decorator';

const AGENCE_ID = '00000000-0000-0000-0000-000000000001';
const USER: JwtPayload = {
  sub: '00000000-0000-0000-0000-0000000000aa',
  agence_id: AGENCE_ID,
  email: 'test@civora.dev',
  permissions: ['*:*'],
};

function makeService(opts: {
  countByAgence?: number;
  createImpl?: (data: unknown) => Promise<unknown>;
  findById?: (id: string) => Promise<unknown>;
  withTenantImpl?: <T>(_: string, fn: (tx: unknown) => Promise<T>) => Promise<T>;
} = {}): BiensService {
  const tenantCtx = {
    requireAgenceId: () => AGENCE_ID,
    getAgenceId: () => AGENCE_ID,
  };
  const repo = {
    countByAgence: vi.fn().mockResolvedValue(opts.countByAgence ?? 0),
    findById: vi.fn().mockImplementation(opts.findById ?? (() => Promise.resolve(null))),
    update: vi.fn(),
    archive: vi.fn(),
  };
  const prisma = {
    withTenant: opts.withTenantImpl ?? (async <T,>(_: string, fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        bien: {
          create: opts.createImpl ?? vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    }),
    bien: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  const eventBus = { emitInTx: vi.fn().mockResolvedValue(undefined) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };

  return new BiensService(
    prisma as never,
    repo as never,
    tenantCtx as never,
    eventBus as never,
    audit as never,
  );
}

describe('BiensService — validation métier', () => {
  it("refuse usage=vente sans prix_vente_xof", async () => {
    const svc = makeService();
    const dto: CreateBienDto = {
      nom: 'Villa',
      type: 'villa',
      usage: 'vente',
      adresse_ligne1: '1 rue X',
      ville: 'Abidjan',
    } as never;
    await expect(svc.create(dto, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse usage=location_longue_duree sans loyer_mensuel_xof", async () => {
    const svc = makeService();
    const dto: CreateBienDto = {
      nom: 'F2',
      type: 'appartement',
      usage: 'location_longue_duree',
      adresse_ligne1: '1 rue X',
      ville: 'Abidjan',
    } as never;
    await expect(svc.create(dto, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse usage=mixte si l'un des deux montants manque", async () => {
    const svc = makeService();
    const dto: CreateBienDto = {
      nom: 'Villa',
      type: 'villa',
      usage: 'mixte',
      prix_vente_xof: 100_000_000n,
      // pas de loyer
      adresse_ligne1: '1 rue X',
      ville: 'Abidjan',
    } as never;
    await expect(svc.create(dto, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse latitude sans longitude (ou inverse)', async () => {
    const svc = makeService();
    const dto: CreateBienDto = {
      nom: 'X',
      type: 'studio',
      usage: 'location_longue_duree',
      loyer_mensuel_xof: 10_000_000n,
      adresse_ligne1: '1 rue X',
      ville: 'Abidjan',
      latitude: 5.35,
      // pas de longitude
    } as never;
    await expect(svc.create(dto, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte une création minimale avec loyer', async () => {
    const createMock = vi.fn().mockResolvedValue({
      id: 'biens-1',
      reference: 'BIE-2026-0001',
      agence_id: AGENCE_ID,
      type: 'studio',
      usage: 'location_longue_duree',
      statut: 'disponible',
      ville: 'Abidjan',
      commune: null,
      roles: [],
    });
    const svc = makeService({ createImpl: createMock });
    const dto: CreateBienDto = {
      nom: 'Studio Cocody',
      type: 'studio',
      usage: 'location_longue_duree',
      loyer_mensuel_xof: 15_000_000n,
      adresse_ligne1: '12 rue X',
      ville: 'Abidjan',
    } as never;
    await svc.create(dto, USER);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('BiensService — référence auto', () => {
  it("génère BIE-YYYY-0001 quand l'agence n'a aucun bien dans l'année", async () => {
    const createMock = vi.fn().mockImplementation(({ data }: { data: { reference: string } }) => {
      const year = new Date().getFullYear();
      expect(data.reference).toBe(`BIE-${year}-0001`);
      return Promise.resolve({ ...data, id: 'biens-1', archived_at: null });
    });
    const svc = makeService({ countByAgence: 0, createImpl: createMock });
    const dto: CreateBienDto = {
      nom: 'V', type: 'villa', usage: 'location_longue_duree',
      loyer_mensuel_xof: 100n, adresse_ligne1: 'x', ville: 'Abidjan',
    } as never;
    await svc.create(dto, USER);
  });

  it('incrémente la séquence par agence', async () => {
    const createMock = vi.fn().mockImplementation(({ data }: { data: { reference: string } }) => {
      const year = new Date().getFullYear();
      expect(data.reference).toBe(`BIE-${year}-0043`);
      return Promise.resolve({ ...data, id: 'biens-43', archived_at: null });
    });
    const svc = makeService({ countByAgence: 42, createImpl: createMock });
    const dto: CreateBienDto = {
      nom: 'V', type: 'villa', usage: 'location_longue_duree',
      loyer_mensuel_xof: 100n, adresse_ligne1: 'x', ville: 'Abidjan',
    } as never;
    await svc.create(dto, USER);
  });
});

describe('BiensService — update', () => {
  it('refuse de modifier la référence', async () => {
    const existing = {
      id: 'biens-1',
      agence_id: AGENCE_ID,
      reference: 'BIE-2026-0001',
      usage: 'location_longue_duree',
      prix_vente_xof: null,
      loyer_mensuel_xof: 100n,
      statut: 'disponible',
      archived_at: null,
    };
    const svc = makeService({ findById: () => Promise.resolve(existing) });
    await expect(
      svc.update('biens-1', { reference: 'BIE-2026-9999' } as never, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
