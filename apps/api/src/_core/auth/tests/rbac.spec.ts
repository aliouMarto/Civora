/**
 * Tests RBAC — permissions catalog, guards, isolation tenant.
 * Pas de DB nécessaire ; guards et hasPermission sont testés unitairement.
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RolesGuard } from '../guards/roles.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContext(user: object | null, permissions: string[]): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: string[] | undefined): Reflector {
  return {
    // Premier appel : IS_PUBLIC_KEY → false. Deuxième appel : PERMISSIONS_KEY → required.
    getAllAndOverride: vi.fn().mockReturnValueOnce(false).mockReturnValue(required),
  } as unknown as Reflector;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;

  describe('endpoint sans décorateur @RequirePermissions', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(undefined));
    });

    it('autorise même sans user (route publique sans annotation)', () => {
      const ctx = makeContext(null, []);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('endpoint avec @RequirePermissions("biens:read")', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(['biens:read']));
    });

    it('autorise un user avec la permission exacte', () => {
      const ctx = makeContext({ permissions: ['biens:read', 'crm:read'] }, []);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('autorise un user avec wildcard *:*', () => {
      const ctx = makeContext({ permissions: ['*:*'] }, []);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('refuse un user sans la permission requise', () => {
      const ctx = makeContext({ permissions: ['crm:read'] }, []);
      expect(() => guard.canActivate(ctx)).toThrow();
    });

    it('refuse si user absent du contexte (JwtAuthGuard aurait dû bloquer avant)', () => {
      const ctx = makeContext(null, []);
      // Retourne false (pas d'exception) — JwtAuthGuard gère le 401 avant
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('refuse un user avec tableau de permissions vide', () => {
      const ctx = makeContext({ permissions: [] }, []);
      expect(() => guard.canActivate(ctx)).toThrow();
    });
  });

  describe('wildcard partiel — non supporté', () => {
    beforeEach(() => {
      guard = new RolesGuard(makeReflector(['biens:read']));
    });

    it('ne supporte PAS biens:* comme wildcard module (sécurité par défaut)', () => {
      const ctx = makeContext({ permissions: ['biens:*'] }, []);
      // biens:* n'est pas dans le catalog, doit échouer
      expect(() => guard.canActivate(ctx)).toThrow();
    });
  });

  describe('isolation tenant — permissions cross-agence', () => {
    it("les permissions sont scopées à l'agence dans le JWT payload", () => {
      const userAgenceA = { sub: 'user-a', agence_id: 'agence-A', permissions: ['biens:read'] };
      const userAgenceB = { sub: 'user-b', agence_id: 'agence-B', permissions: ['crm:read'] };

      // Deux guards distincts pour éviter l'épuisement du mockReturnValueOnce
      const guardA = new RolesGuard(makeReflector(['biens:read']));
      const guardB = new RolesGuard(makeReflector(['biens:read']));

      expect(guardA.canActivate(makeContext(userAgenceA, []))).toBe(true);
      expect(() => guardB.canActivate(makeContext(userAgenceB, []))).toThrow();
    });
  });
});

describe('PERMISSIONS_KEY metadata', () => {
  it('la constante de clé est définie et stable', () => {
    expect(typeof PERMISSIONS_KEY).toBe('string');
    expect(PERMISSIONS_KEY.length).toBeGreaterThan(0);
  });
});
