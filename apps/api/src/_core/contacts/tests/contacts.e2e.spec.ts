/**
 * E2E HTTP : parcours complet du module Contacts.
 *
 * Boot du module Nest avec auth + tenancy réels, deux tokens JWT signés
 * pour deux agences distinctes. Vérifie :
 *   - parcours nominal CRUD + interactions + segments + merge
 *   - isolation RLS : aucune fuite entre agence A et B sur tous les endpoints
 *   - permissions : un user avec scope limité ne peut pas DELETE
 *
 * Pré-requis : Postgres et Redis up, migrations appliquées.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../../app.module';

const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ??
  'postgresql://civora_admin:civora_admin_secret@localhost:5432/civora';

process.env['DATABASE_APP_URL'] =
  process.env['DATABASE_APP_URL'] ??
  'postgresql://civora_app:civora_app_secret@localhost:5432/civora';

process.env['JWT_ACCESS_SECRET'] =
  process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-min-32-chars-aaaaaaaaaa';
process.env['JWT_REFRESH_SECRET'] =
  process.env['JWT_REFRESH_SECRET'] ?? 'test-refresh-secret-min-32-chars-bbbbbbbbbb';

const prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
const SLUG = 'e2e-spec-';

let app: INestApplication;
let jwt: JwtService;
let agenceAId: string;
let agenceBId: string;
let userAId: string;
let userBId: string;
let userMarketingId: string;
let tokenA: string;
let tokenB: string;
let tokenMarketing: string;

function tokenFor(userId: string, agenceId: string, email: string, perms: string[]): string {
  return jwt.sign(
    { sub: userId, agence_id: agenceId, email, permissions: perms },
    {
      secret: process.env['JWT_ACCESS_SECRET'],
      expiresIn: '1h',
    },
  );
}

beforeAll(async () => {
  await prismaAdmin.$connect();

  // Nettoyage du dataset précédent
  await prismaAdmin.$executeRaw`DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM segment_membres WHERE segment_id IN (SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`}))`;
  await prismaAdmin.$executeRaw`DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;

  const [a, b] = await Promise.all([
    prismaAdmin.agence.create({ data: { nom: 'E2E-A', slug: `${SLUG}a` } }),
    prismaAdmin.agence.create({ data: { nom: 'E2E-B', slug: `${SLUG}b` } }),
  ]);
  agenceAId = a.id;
  agenceBId = b.id;

  const [uA, uB, uM] = await Promise.all([
    prismaAdmin.utilisateur.create({
      data: { agence_id: agenceAId, email: 'admin-a@e2e.civora', password_hash: 'x', nom: 'A', prenom: 'Admin', statut: 'actif' },
    }),
    prismaAdmin.utilisateur.create({
      data: { agence_id: agenceBId, email: 'admin-b@e2e.civora', password_hash: 'x', nom: 'B', prenom: 'Admin', statut: 'actif' },
    }),
    prismaAdmin.utilisateur.create({
      data: { agence_id: agenceAId, email: 'marketing-a@e2e.civora', password_hash: 'x', nom: 'A', prenom: 'Marketing', statut: 'actif' },
    }),
  ]);
  userAId = uA.id;
  userBId = uB.id;
  userMarketingId = uM.id;

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  jwt = app.get(JwtService);

  tokenA = tokenFor(userAId, agenceAId, uA.email, ['*:*']);
  tokenB = tokenFor(userBId, agenceBId, uB.email, ['*:*']);
  tokenMarketing = tokenFor(userMarketingId, agenceAId, uM.email, [
    'contacts:read',
    'contacts:write',
    // pas de contacts:delete
  ]);
}, 60_000);

afterAll(async () => {
  await prismaAdmin.$executeRaw`DELETE FROM interactions WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM segment_membres WHERE segment_id IN (SELECT id FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`}))`;
  await prismaAdmin.$executeRaw`DELETE FROM segments WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM contacts WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM domain_events WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM audit_log WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM utilisateurs WHERE agence_id IN (SELECT id FROM agences WHERE slug LIKE ${`${SLUG}%`})`;
  await prismaAdmin.$executeRaw`DELETE FROM agences WHERE slug LIKE ${`${SLUG}%`}`;
  await Promise.all([app?.close(), prismaAdmin.$disconnect()]);
});

describe('Contacts E2E — parcours nominal', () => {
  let cA1: string;
  let cA2: string;
  let cB1: string;

  it("POST /contacts crée 3 contacts (2 en A, 1 en B)", async () => {
    const r1 = await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        nom: 'Bamba',
        prenom: 'Sory',
        email: 'sory.bamba@e2e.ci',
        telephone: '+2250707400001',
        roles: ['prospect'],
      })
      .expect(201);
    cA1 = r1.body.id;

    const r2 = await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        nom: 'Kouassi',
        prenom: 'Aminata',
        email: 'aminata.kouassi@e2e.ci',
        roles: ['locataire'],
      })
      .expect(201);
    cA2 = r2.body.id;

    const r3 = await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        nom: 'Diallo',
        prenom: 'Ibrahim',
        email: 'ibrahim.diallo@e2e.ci',
        roles: ['proprietaire'],
      })
      .expect(201);
    cB1 = r3.body.id;

    expect(cA1).toBeDefined();
    expect(cA2).toBeDefined();
    expect(cB1).toBeDefined();
  });

  it('POST /contacts/check-duplicates renvoie le doublon sur email exact', async () => {
    const r = await request(app.getHttpServer())
      .post('/contacts/check-duplicates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'sory.bamba@e2e.ci' })
      .expect(200);
    expect(r.body.matches.length).toBeGreaterThanOrEqual(1);
    expect(r.body.matches[0].matched_on).toContain('email');
  });

  it('POST /contacts refuse un doublon (409)', async () => {
    await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nom: 'X', email: 'sory.bamba@e2e.ci' })
      .expect(409);
  });

  it('GET /contacts liste paginée filtre par agence (RLS)', async () => {
    const rA = await request(app.getHttpServer())
      .get('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const idsA: string[] = rA.body.items.map((c: { id: string }) => c.id);
    expect(idsA).toContain(cA1);
    expect(idsA).toContain(cA2);
    expect(idsA).not.toContain(cB1);

    const rB = await request(app.getHttpServer())
      .get('/contacts')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    const idsB: string[] = rB.body.items.map((c: { id: string }) => c.id);
    expect(idsB).toContain(cB1);
    expect(idsB).not.toContain(cA1);
    expect(idsB).not.toContain(cA2);
  });

  it("GET /contacts/:id : B ne peut pas lire un contact de A (404)", async () => {
    await request(app.getHttpServer())
      .get(`/contacts/${cA1}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("PATCH /contacts/:id : B ne peut pas modifier un contact de A (404)", async () => {
    await request(app.getHttpServer())
      .patch(`/contacts/${cA1}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nom: 'pwned' })
      .expect(404);
  });

  it('POST /contacts/:id/interactions ajoute une interaction', async () => {
    const r = await request(app.getHttpServer())
      .post(`/contacts/${cA1}/interactions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'whatsapp', direction: 'sortant', sujet: 'relance' })
      .expect(201);
    expect(r.body.id).toBeDefined();
  });

  it("GET /contacts/:id/interactions : B ne voit pas les interactions de A (404)", async () => {
    await request(app.getHttpServer())
      .get(`/contacts/${cA1}/interactions`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("POST /segments crée un segment dans l'agence A", async () => {
    const r = await request(app.getHttpServer())
      .post('/segments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nom: 'E2E-Prospects', filtres: { roles: ['prospect'] } })
      .expect(201);
    expect(r.body.id).toBeDefined();
  });

  it('GET /segments isole par agence', async () => {
    const rA = await request(app.getHttpServer())
      .get('/segments')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(rA.body.find((s: { nom: string }) => s.nom === 'E2E-Prospects')).toBeDefined();

    const rB = await request(app.getHttpServer())
      .get('/segments')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(rB.body.find((s: { nom: string }) => s.nom === 'E2E-Prospects')).toBeUndefined();
  });

  it("DELETE /contacts/:id : user Marketing (sans contacts:delete) → 403", async () => {
    await request(app.getHttpServer())
      .delete(`/contacts/${cA2}`)
      .set('Authorization', `Bearer ${tokenMarketing}`)
      .expect(403);
  });

  it("DELETE /contacts/:id : user Admin de A archive le contact", async () => {
    await request(app.getHttpServer())
      .delete(`/contacts/${cA2}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  it("GET /contacts par défaut exclut les archivés", async () => {
    const r = await request(app.getHttpServer())
      .get('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(r.body.items.find((c: { id: string }) => c.id === cA2)).toBeUndefined();
  });

  it("GET /contacts?include_archived=true rend les archivés visibles", async () => {
    const r = await request(app.getHttpServer())
      .get('/contacts?include_archived=true')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(r.body.items.find((c: { id: string }) => c.id === cA2)).toBeDefined();
  });

  it("POST /contacts/merge fusionne deux contacts", async () => {
    // Re-créer une cible vivante pour le merge
    const masterR = await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nom: 'Master', email: 'merge-master@e2e.ci' })
      .expect(201);
    const sourceR = await request(app.getHttpServer())
      .post('/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nom: 'Source', email: 'merge-source@e2e.ci', roles: ['acheteur'] })
      .expect(201);

    const merged = await request(app.getHttpServer())
      .post('/contacts/merge')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        master_id: masterR.body.id,
        source_ids: [sourceR.body.id],
        strategy: 'keep_master',
      })
      .expect(200);

    expect(merged.body.master.id).toBe(masterR.body.id);
    expect(new Set(merged.body.master.roles)).toContain('acheteur');
  });

  it("événements contact.* émis et présents en outbox", async () => {
    const events = await prismaAdmin.domainEvent.findMany({
      where: { agence_id: agenceAId, type: { startsWith: 'contact.' } },
    });
    const types = new Set(events.map((e) => e.type));
    expect(types.has('contact.created')).toBe(true);
    expect(types.has('contact.merged')).toBe(true);
    expect(types.has('contact.archived')).toBe(true);
  });
});
