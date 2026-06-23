import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import supertest from 'supertest';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET / returns 200', async () => {
    const response = await supertest(app.getHttpServer()).get('/');
    expect(response.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
