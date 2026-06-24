/**
 * Tests unitaires AuthService.
 * PrismaService et JwtService sont mockés — pas besoin de DB.
 */
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { describe, it, expect, beforeAll, vi } from 'vitest';

import { AuthService } from '../auth.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  utilisateur: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  refreshToken: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

const mockJwt = {
  signAsync: vi.fn().mockResolvedValue('mock-access-token'),
};

const mockConfig = {
  get: vi.fn((key: string) => {
    const map: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-secret-at-least-32-chars-long!!',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_DAYS: 14,
    };
    return map[key];
  }),
};

const mockReq = { headers: { 'user-agent': 'test' }, ip: '127.0.0.1' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let svc: AuthService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get(AuthService);
  });

  describe('hashPassword / verifyPassword', () => {
    it('hache et vérifie un mot de passe correctement', async () => {
      const hash = await svc.hashPassword('MonMotDePasse123');
      expect(hash).toMatch(/^\$argon2id/);
      expect(await svc.verifyPassword(hash, 'MonMotDePasse123')).toBe(true);
      expect(await svc.verifyPassword(hash, 'mauvais')).toBe(false);
    });
  });

  describe('login', () => {
    it('retourne les tokens pour des credentials valides', async () => {
      const passwordHash = await argon2.hash('MotDePasse123', { type: argon2.argon2id });

      mockPrisma.utilisateur.findUnique.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'admin@test.ci',
        password_hash: passwordHash,
        nom: 'Diaby',
        prenom: 'Ali',
        agence_id: 'agence-uuid',
        statut: 'actif',
        roles: [{ role: { permissions: ['biens:read'] } }],
      });
      mockPrisma.utilisateur.update.mockResolvedValueOnce({});
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const result = await svc.login({ email: 'admin@test.ci', password: 'MotDePasse123' }, mockReq);

      expect(result).toHaveProperty('access_token', 'mock-access-token');
      expect(result).toHaveProperty('refresh_token');
      expect(typeof result.refresh_token).toBe('string');
    });

    it('rejette un mauvais mot de passe (sans fuiter le timing)', async () => {
      const passwordHash = await argon2.hash('MotDePasse123', { type: argon2.argon2id });

      mockPrisma.utilisateur.findUnique.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'admin@test.ci',
        password_hash: passwordHash,
        statut: 'actif',
        roles: [],
      });

      await expect(
        svc.login({ email: 'admin@test.ci', password: 'mauvais' }, mockReq),
      ).rejects.toMatchObject({ message: 'Invalid credentials' });
    });

    it("rejette si l'utilisateur n'existe pas", async () => {
      mockPrisma.utilisateur.findUnique.mockResolvedValueOnce(null);

      await expect(
        svc.login({ email: 'inconnu@test.ci', password: 'anything' }, mockReq),
      ).rejects.toMatchObject({ message: 'Invalid credentials' });
    });

    it('rejette un compte désactivé', async () => {
      const passwordHash = await argon2.hash('MotDePasse123', { type: argon2.argon2id });

      mockPrisma.utilisateur.findUnique.mockResolvedValueOnce({
        id: 'user-uuid',
        email: 'admin@test.ci',
        password_hash: passwordHash,
        statut: 'desactive',
        roles: [],
      });

      await expect(
        svc.login({ email: 'admin@test.ci', password: 'MotDePasse123' }, mockReq),
      ).rejects.toMatchObject({ message: 'Account disabled' });
    });
  });

  describe('refresh', () => {
    it('détecte le rejeu et révoque toute la famille', async () => {
      // Token déjà révoqué (revoque_at !== null)
      mockPrisma.refreshToken.findFirst.mockResolvedValueOnce({
        id: 'rt-id',
        famille: 'famille-uuid',
        utilisateur_id: 'user-uuid',
        revoque_at: new Date(), // déjà révoqué !
        expire_at: new Date(Date.now() + 10000),
        utilisateur: { id: 'user-uuid', agence_id: 'agence-uuid', email: 'x', roles: [] },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({});

      await expect(svc.refresh('some-token', mockReq)).rejects.toMatchObject({
        message: expect.stringContaining('already used'),
      });

      // Vérifier que updateMany a été appelé (révocation en cascade)
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { famille: 'famille-uuid' },
        data: { revoque_at: expect.any(Date) },
      });
    });

    it('rejette un token inexistant', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(null);

      await expect(svc.refresh('fake-token', mockReq)).rejects.toMatchObject({
        message: 'Invalid refresh token',
      });
    });
  });
});
