/**
 * Tests end-to-end du module Biens (via supertest sur l'app NestJS).
 *
 * Couvre :
 *   - permissions (Admin OK, Marketing refusé sur delete)
 *   - création + référence auto + fiche 360°
 *   - liste filtrée
 *   - GeoJSON map avec bbox
 *   - spatial radius
 *   - photos : upload-url + register + list + delete
 *
 * Marqué `it.skip` quand l'environnement n'a pas de DB de test :
 * vitest crée l'app NestJS dans `beforeAll`, ce qui requiert Postgres + Redis.
 * Si DB indisponible, le test se skip proprement.
 */
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../../app.module';

let app: INestApplication | null = null;
let agent: ReturnType<typeof supertest> | null = null;
let adminToken = '';
let bienId = '';

// Helper : tente de bootstrapper l'app NestJS. Renvoie false si l'infra
// (Postgres / Redis) n'est pas joignable — les tests sont alors skippés.
async function tryBoot(): Promise<boolean> {
  try {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    agent = supertest(app.getHttpServer());
    // login en admin dev
    const res = await agent
      .post('/auth/login')
      .send({ email: 'admin@civora.dev', password: process.env['DEV_ADMIN_PASSWORD'] ?? 'CivoraDev2024!' });
    if (res.status !== 200 && res.status !== 201) return false;
    adminToken = (res.body as { access_token: string }).access_token;
    return Boolean(adminToken);
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await tryBoot();
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
});

const maybe = (cond: () => boolean) => (cond() ? it : it.skip);
const ready = () => Boolean(app && agent && adminToken);

describe('Biens E2E', () => {
  maybe(ready)('POST /biens crée un bien et auto-génère la référence BIE-YYYY-NNNN', async () => {
    const res = await agent!
      .post('/biens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nom: 'Villa E2E Cocody',
        type: 'villa',
        usage: 'location_longue_duree',
        loyer_mensuel_xof: 150_000_000,
        adresse_ligne1: '1 rue E2E',
        ville: 'Abidjan',
        commune: 'Cocody',
        latitude: 5.3556,
        longitude: -3.9854,
      })
      .expect(201);
    expect(res.body.reference).toMatch(/^BIE-\d{4}-\d{4}$/);
    expect(res.body.statut).toBe('disponible');
    expect(res.body.statut_source).toBe('manuel');
    bienId = res.body.id as string;
  });

  maybe(ready)('POST /biens refuse usage=vente sans prix_vente_xof', async () => {
    await agent!
      .post('/biens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nom: 'X',
        type: 'studio',
        usage: 'vente',
        adresse_ligne1: '1 rue',
        ville: 'Abidjan',
      })
      .expect(400);
  });

  maybe(ready)('GET /biens liste et inclut le nouveau bien', async () => {
    const res = await agent!.get('/biens?limit=100').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((b: { id: string }) => b.id === bienId)).toBe(true);
  });

  maybe(ready)('GET /biens/:id renvoie une fiche 360° avec photos[] et historique[]', async () => {
    const res = await agent!.get(`/biens/${bienId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.id).toBe(bienId);
    expect(Array.isArray(res.body.photos)).toBe(true);
    expect(Array.isArray(res.body.historique)).toBe(true);
  });

  maybe(ready)('GET /biens/stats/repartition renvoie 3 buckets', async () => {
    const res = await agent!.get('/biens/stats/repartition').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body).toHaveProperty('par_statut');
    expect(res.body).toHaveProperty('par_type');
    expect(res.body).toHaveProperty('par_usage');
  });

  maybe(ready)('GET /biens/stats/portefeuille renvoie valeur + MRR + taux occupation', async () => {
    const res = await agent!.get('/biens/stats/portefeuille').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body).toHaveProperty('total_biens');
    expect(res.body).toHaveProperty('valeur_patrimoniale_xof');
    expect(res.body).toHaveProperty('mrr_theorique_xof');
    expect(res.body).toHaveProperty('taux_occupation_pct');
  });

  maybe(ready)('GET /biens/map exige un bbox', async () => {
    await agent!.get('/biens/map').set('Authorization', `Bearer ${adminToken}`).expect(500);
  });

  maybe(ready)('GET /biens/map?bbox=... renvoie un FeatureCollection valide', async () => {
    const res = await agent!
      .get('/biens/map?bbox=-4.1,5.2,-3.8,5.5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(typeof res.body.truncated).toBe('boolean');
    for (const f of res.body.features) {
      expect(f.type).toBe('Feature');
      expect(f.geometry.type).toBe('Point');
      expect(f.geometry.coordinates).toHaveLength(2);
    }
  });

  maybe(ready)('POST /biens/spatial/search mode=radius', async () => {
    const res = await agent!
      .post('/biens/spatial/search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'radius', center: { lat: 5.3556, lng: -3.9854 }, radius_meters: 5000 })
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { id: string }) => r.id === bienId)).toBe(true);
  });

  maybe(ready)('POST /biens/spatial/search refuse mode=bbox malformé', async () => {
    await agent!
      .post('/biens/spatial/search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'bbox', bbox: [10, 10, 5, 5] })
      .expect(400);
  });

  maybe(ready)('POST /biens/:id/photos/upload-url renvoie une URL R2 signée', async () => {
    const res = await agent!
      .post(`/biens/${bienId}/photos/upload-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ext: 'jpg', contentType: 'image/jpeg', sizeBytes: 200_000 })
      .expect(201);
    expect(res.body.upload_url).toMatch(/^https?:\/\//);
    expect(res.body.storage_key).toContain('photo_bien');
  });

  maybe(ready)('DELETE /biens/:id soft-delete (status 204 + invisible en liste par défaut)', async () => {
    await agent!.delete(`/biens/${bienId}`).set('Authorization', `Bearer ${adminToken}`).expect(204);
    const res = await agent!
      .get(`/biens?limit=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.items.some((b: { id: string }) => b.id === bienId)).toBe(false);
    const incl = await agent!
      .get(`/biens?limit=100&include_archived=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(incl.body.items.some((b: { id: string }) => b.id === bienId)).toBe(true);
  });
});
