/**
 * Tests d'intégration du ContactsService.
 *
 * Couvre :
 *   - création OK + émission d'event contact.created
 *   - création avec doublon dur → 409
 *   - update avec changement d'email puis re-conflict
 *   - archive (soft delete) idempotent, invisible par défaut
 *   - merge : interactions et segments du source basculent vers master, sources archivées
 *   - audit branché sur merge (entrée avec before/after)
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { EventContextService } from '../../events/event-context.service';
import { OutboxService } from '../../events/outbox.service';
import { EventBusService } from '../../events/event-bus.service';
import { AuditService } from '../../audit/audit.service';

import { ContactsRepository } from '../contacts.repository';
import { ContactsDedupService } from '../contacts-dedup.service';
import { ContactsService } from '../contacts.service';

import type { JwtPayload } from '../../auth/decorators/current-user.decorator';

process.env['DATABASE_APP_URL'] =
  process.env['DATABASE_APP_URL'] ??
  'postgresql://civora_app:civora_app_secret@localhost:5432/civora';

const prismaAdmin = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env['DATABASE_ADMIN_URL'] ??
        'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora',
    },
  },
});

const SLUG = 'svc-spec-';
let agenceAId: string;
let userAId: string;
let userAJwt: JwtPayload;
let prismaSvc: PrismaService;
let tenantCtx: TenantContextService;
let service: ContactsService;
let segmentAId: string;

beforeAll(async () => {
  await prismaAdmin.$connect();

  prismaSvc = new PrismaService(/* tenantCtx injecté plus bas */);
  tenantCtx = new TenantContextService();
  // ré-instancier PrismaService avec tenantCtx (l'auto-extension utilise ce contexte)
  await prismaSvc.onModuleDestroy().catch(() => undefined);
  prismaSvc = new PrismaService(tenantCtx);
  await prismaSvc.onModuleInit();

  const eventCtx = new EventContextService(tenantCtx);
  const outbox = new OutboxService(eventCtx);
  const eventBus = new EventBusService(outbox, prismaSvc, tenantCtx, eventCtx);
  const audit = new AuditService(prismaSvc, tenantCtx);
  const repo = new ContactsRepository(prismaSvc);
  const dedup = new ContactsDedupService(repo);
  service = new ContactsService(prismaSvc, repo, dedup, eventBus, tenantCtx, audit);

  // Nettoyage
  await prismaAdmin.$executeRaw`DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM segment_membres WHERE segment_id IN (SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`}))`;
  await prismaAdmin.$executeRaw`DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;

  const a = await prismaAdmin.agence.create({ data: { nom: 'SVC', slug: `${SLUG}a` } });
  agenceAId = a.id;
  const u = await prismaAdmin.utilisateur.create({
    data: {
      agence_id: agenceAId,
      email: 'tester@svc-spec.civora',
      password_hash: 'x',
      nom: 'Tester',
      prenom: 'Svc',
      statut: 'actif',
    },
  });
  userAId = u.id;
  userAJwt = {
    sub: userAId,
    agence_id: agenceAId,
    email: u.email,
    permissions: ['*:*'],
  };
  const seg = await prismaAdmin.segment.create({
    data: { agence_id: agenceAId, nom: 'VIP', filtres: { tags: ['vip'] } },
  });
  segmentAId = seg.id;
});

afterAll(async () => {
  await prismaAdmin.$executeRaw`DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM segment_membres WHERE segment_id IN (SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`}))`;
  await prismaAdmin.$executeRaw`DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;
  await Promise.all([prismaSvc.onModuleDestroy(), prismaAdmin.$disconnect()]);
});

// Helper : exécuter une opération dans le contexte tenant.
function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantCtx.run(agenceAId, fn);
}

describe('ContactsService — création', () => {
  it('crée un contact et émet contact.created', async () => {
    const created = await asTenant(() =>
      service.create(
        {
          nom: 'Bamba',
          prenom: 'Sory',
          email: 'create-1@svc-spec.ci',
          telephone: '+2250707100001',
          roles: ['prospect'],
        },
        userAJwt,
      ),
    );

    expect(created.id).toBeDefined();
    expect(created.email).toBe('create-1@svc-spec.ci');
    expect(created.telephone).toBe('+2250707100001');

    const events = await prismaAdmin.domainEvent.findMany({
      where: { aggregate_id: created.id, type: 'contact.created' },
    });
    expect(events).toHaveLength(1);
  });

  it("normalise le téléphone local CI vers E.164 à la création", async () => {
    const created = await asTenant(() =>
      service.create(
        {
          nom: 'Kouassi',
          prenom: 'Aminata',
          email: 'create-2@svc-spec.ci',
          telephone: '0707100002',
          roles: ['prospect'],
        },
        userAJwt,
      ),
    );
    expect(created.telephone).toBe('+2250707100002');
  });

  it('refuse une création sans email ni téléphone (400)', async () => {
    await expect(
      asTenant(() =>
        service.create(
          { nom: 'Sans-Canal', roles: ['prospect'] },
          userAJwt,
        ),
      ),
    ).rejects.toThrow(/email OU telephone/);
  });

  it('refuse une création avec email déjà existant dans la même agence (409)', async () => {
    await asTenant(() =>
      service.create(
        { nom: 'A', email: 'dup-email@svc-spec.ci', telephone: '+2250707100010' },
        userAJwt,
      ),
    );

    await expect(
      asTenant(() =>
        service.create(
          { nom: 'B', email: 'dup-email@svc-spec.ci', telephone: '+2250707100011' },
          userAJwt,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ContactsService — archive (soft delete)', () => {
  it('archive un contact et le rend invisible par défaut', async () => {
    const c = await asTenant(() =>
      service.create(
        { nom: 'ToArchive', email: 'archive-1@svc-spec.ci' },
        userAJwt,
      ),
    );
    await asTenant(() => service.archive(c.id, userAJwt));

    const listDefault = await asTenant(() => service.list({}));
    expect(listDefault.items.find((x) => x.id === c.id)).toBeUndefined();

    const listIncluded = await asTenant(() => service.list({ include_archived: true }));
    expect(listIncluded.items.find((x) => x.id === c.id)).toBeDefined();
  });

  it('archive est idempotente', async () => {
    const c = await asTenant(() =>
      service.create(
        { nom: 'TwiceArchive', email: 'archive-2@svc-spec.ci' },
        userAJwt,
      ),
    );
    await asTenant(() => service.archive(c.id, userAJwt));
    // Deuxième archive ne doit pas lever
    await asTenant(() => service.archive(c.id, userAJwt));
  });

  it('archive sur un contact inexistant → 404', async () => {
    await expect(
      asTenant(() => service.archive('00000000-0000-0000-0000-000000000000', userAJwt)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ContactsService — merge', () => {
  it('reporte interactions et segments des sources vers master, archive les sources', async () => {
    const master = await asTenant(() =>
      service.create(
        { nom: 'Master', email: 'merge-master@svc-spec.ci', roles: ['prospect'] },
        userAJwt,
      ),
    );
    const src1 = await asTenant(() =>
      service.create(
        { nom: 'Source1', email: 'merge-src1@svc-spec.ci', roles: ['locataire'], tags: ['vip'] },
        userAJwt,
      ),
    );
    const src2 = await asTenant(() =>
      service.create(
        { nom: 'Source2', telephone: '+2250707200002', roles: ['acheteur'], tags: ['investisseur'] },
        userAJwt,
      ),
    );

    // Interactions sur les sources
    await prismaAdmin.interaction.create({
      data: { agence_id: agenceAId, contact_id: src1.id, type: 'note', sujet: 's1-note' },
    });
    await prismaAdmin.interaction.create({
      data: { agence_id: agenceAId, contact_id: src2.id, type: 'appel', direction: 'sortant' },
    });
    // Segment sur src1
    await prismaAdmin.segmentMembre.create({
      data: { segment_id: segmentAId, contact_id: src1.id },
    });

    const result = await asTenant(() =>
      service.merge(
        { master_id: master.id, source_ids: [src1.id, src2.id], strategy: 'keep_master' },
        userAJwt,
      ),
    );

    expect(result.interactions_moved).toBe(2);
    expect(result.segments_moved).toBe(1);

    // Toutes les interactions pointent vers le master
    const interactionsOnMaster = await prismaAdmin.interaction.count({
      where: { contact_id: master.id },
    });
    expect(interactionsOnMaster).toBe(2);

    // Le master est dans le segment, les sources n'y sont plus
    const segMembres = await prismaAdmin.segmentMembre.findMany({
      where: { segment_id: segmentAId, contact_id: { in: [master.id, src1.id, src2.id] } },
    });
    expect(segMembres).toHaveLength(1);
    expect(segMembres[0]!.contact_id).toBe(master.id);

    // Sources soft-deleted
    const archivedSrc1 = await prismaAdmin.contact.findUnique({ where: { id: src1.id } });
    expect(archivedSrc1?.archived_at).not.toBeNull();
    const archivedSrc2 = await prismaAdmin.contact.findUnique({ where: { id: src2.id } });
    expect(archivedSrc2?.archived_at).not.toBeNull();

    // Roles et tags fusionnés en union
    const updatedMaster = await prismaAdmin.contact.findUnique({ where: { id: master.id } });
    expect(new Set(updatedMaster!.roles)).toEqual(
      new Set(['prospect', 'locataire', 'acheteur']),
    );
    expect(new Set(updatedMaster!.tags)).toEqual(new Set(['vip', 'investisseur']));

    // Audit log de merge présent
    const auditEntries = await prismaAdmin.auditLog.findMany({
      where: { action: 'contacts:merge', entity_id: master.id },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(1);

    // Événement contact.merged émis
    const mergedEvents = await prismaAdmin.domainEvent.findMany({
      where: { type: 'contact.merged', aggregate_id: master.id },
    });
    expect(mergedEvents).toHaveLength(1);
  });

  it('refuse de merger un master déjà archivé (400)', async () => {
    const m = await asTenant(() =>
      service.create({ nom: 'WillArchive', email: 'merge-bad@svc-spec.ci' }, userAJwt),
    );
    const s = await asTenant(() =>
      service.create({ nom: 'Src', email: 'merge-bad-s@svc-spec.ci' }, userAJwt),
    );
    await asTenant(() => service.archive(m.id, userAJwt));

    await expect(
      asTenant(() =>
        service.merge({ master_id: m.id, source_ids: [s.id], strategy: 'keep_master' }, userAJwt),
      ),
    ).rejects.toThrow(/archivé/);
  });

  it('refuse master_id ∈ source_ids', async () => {
    const c = await asTenant(() =>
      service.create({ nom: 'SelfMerge', email: 'merge-self@svc-spec.ci' }, userAJwt),
    );
    await expect(
      asTenant(() =>
        service.merge(
          { master_id: c.id, source_ids: [c.id], strategy: 'keep_master' },
          userAJwt,
        ),
      ),
    ).rejects.toThrow();
  });
});

describe('ContactsService — update', () => {
  it('refuse de vider à la fois email ET téléphone', async () => {
    const c = await asTenant(() =>
      service.create(
        { nom: 'Both', email: 'both@svc-spec.ci', telephone: '+2250707300001' },
        userAJwt,
      ),
    );
    await expect(
      asTenant(() =>
        // @ts-expect-error : on simule un override null malgré le DTO partiel
        service.update(c.id, { email: null, telephone: null }, userAJwt),
      ),
    ).rejects.toThrow(/email OU telephone/);
  });

  it('refuse de mettre un email déjà pris par un autre contact', async () => {
    const a = await asTenant(() =>
      service.create({ nom: 'A', email: 'taken-a@svc-spec.ci' }, userAJwt),
    );
    await asTenant(() =>
      service.create({ nom: 'B', email: 'taken-b@svc-spec.ci' }, userAJwt),
    );
    await expect(
      asTenant(() => service.update(a.id, { email: 'taken-b@svc-spec.ci' }, userAJwt)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
