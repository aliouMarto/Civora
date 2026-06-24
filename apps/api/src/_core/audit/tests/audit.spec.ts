import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { AuditInterceptor } from '../audit.interceptor';
import { Audited, AUDITED_KEY } from '../audit.decorator';
import { scrubObject } from '../../observability/sentry.config';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { TenantContextService } from '../../tenancy/tenant-context.service';
import type { Reflector } from '@nestjs/core';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuditService(agence_id: string | null = 'agence-abc') {
  const mockCreate = vi.fn().mockResolvedValue({ id: 'audit-uuid' });

  const mockPrisma = {
    auditLog: { create: mockCreate },
  } as unknown as PrismaService;

  const mockTenantCtx = {
    getAgenceId: vi.fn().mockReturnValue(agence_id),
    requireAgenceId: vi.fn().mockReturnValue(agence_id ?? 'agence-abc'),
  } as unknown as TenantContextService;

  const svc = new AuditService(mockPrisma, mockTenantCtx);
  return { svc, mockCreate, mockPrisma };
}

function makeInterceptor(action: string | undefined, actorSub = 'user-123') {
  const mockReflector = {
    get: vi.fn().mockReturnValue(action ? { action } : undefined),
  } as unknown as Reflector;

  const mockAuditSvc = {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const interceptor = new AuditInterceptor(mockReflector, mockAuditSvc);

  const mockCtx = {
    getHandler: vi.fn().mockReturnValue({}),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue({
        user: { sub: actorSub, agence_id: 'agence-abc', email: 'x@x.io', permissions: [] },
        ip: '127.0.0.1',
        method: 'POST',
        path: '/test',
        headers: { 'x-correlation-id': 'corr-123', 'user-agent': 'test' },
      }),
    }),
  } as unknown as ExecutionContext;

  const mockNext: CallHandler = { handle: () => of({ ok: true }) };

  return { interceptor, mockCtx, mockNext, mockAuditSvc };
}

// ─── Tests : AuditService ─────────────────────────────────────────────────────

describe('AuditService.log()', () => {
  it('insère une ligne avec les bons champs', async () => {
    const { svc, mockCreate } = makeAuditService('agence-abc');

    await svc.log({
      action: 'biens:create',
      actorId: 'user-123',
      entityType: 'Bien',
      entityId: 'bien-uuid',
      after: { nom: 'Villa Cocody', statut: 'disponible' },
      metadata: { ip: '192.168.1.1', correlationId: 'corr-uuid' },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agence_id: 'agence-abc',
        actor_id: 'user-123',
        actor_type: 'user',
        action: 'biens:create',
        entity_type: 'Bien',
        entity_id: 'bien-uuid',
      }),
    });
  });

  it('insère avec agence_id null pour les actions système', async () => {
    const { svc, mockCreate } = makeAuditService(null);

    await svc.log({ action: 'system:seed', actorType: 'system' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agence_id: null,
        actor_type: 'system',
      }),
    });
  });

  it('ne lève pas si Prisma échoue (dégradation silencieuse)', async () => {
    const { svc, mockCreate } = makeAuditService();
    mockCreate.mockRejectedValue(new Error('DB down'));

    await expect(svc.log({ action: 'test:action' })).resolves.toBeUndefined();
  });

  it('avant/après sont stockés dans before/after', async () => {
    const { svc, mockCreate } = makeAuditService();

    await svc.log({
      action: 'biens:update',
      before: { statut: 'disponible' },
      after: { statut: 'loue' },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { statut: 'disponible' },
        after: { statut: 'loue' },
      }),
    });
  });
});

// ─── Tests : AuditInterceptor ─────────────────────────────────────────────────

describe('AuditInterceptor', () => {
  it('appelle audit.log() après chaque appel réussi sur endpoint @Audited', async () => {
    const { interceptor, mockCtx, mockNext, mockAuditSvc } = makeInterceptor('biens:update');

    await new Promise<void>((resolve) => {
      interceptor.intercept(mockCtx, mockNext).subscribe({ complete: resolve });
    });

    expect(mockAuditSvc.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'biens:update', actorId: 'user-123' }),
    );
  });

  it('ne fait rien sur un endpoint sans @Audited', async () => {
    const { interceptor, mockCtx, mockNext, mockAuditSvc } = makeInterceptor(undefined);

    await new Promise<void>((resolve) => {
      interceptor.intercept(mockCtx, mockNext).subscribe({ complete: resolve });
    });

    expect(mockAuditSvc.log).not.toHaveBeenCalled();
  });

  it('inclut correlationId dans les metadata', async () => {
    const { interceptor, mockCtx, mockNext, mockAuditSvc } = makeInterceptor('auth:login');

    await new Promise<void>((resolve) => {
      interceptor.intercept(mockCtx, mockNext).subscribe({ complete: resolve });
    });

    expect(mockAuditSvc.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ correlationId: 'corr-123' }),
      }),
    );
  });
});

// ─── Tests : Décorateur @Audited ──────────────────────────────────────────────

describe('@Audited decorator', () => {
  it('pose le metadata AUDITED_KEY avec la bonne action', () => {
    class TestController {
      @Audited('test:action')
      doSomething(): void {}
    }

    const meta = Reflect.getMetadata(AUDITED_KEY, TestController.prototype.doSomething);
    expect(meta).toEqual({ action: 'test:action' });
  });
});

// ─── Tests : Sentry scrubbing ─────────────────────────────────────────────────

describe('Sentry scrubObject()', () => {
  it('masque le champ password', () => {
    const result = scrubObject({ password: 'secret123', name: 'Test' }) as Record<string, unknown>;
    expect(result['password']).toBe('[SCRUBBED]');
    expect(result['name']).toBe('Test');
  });

  it('masque le champ token', () => {
    const result = scrubObject({ token: 'eyJ...', action: 'login' }) as Record<string, unknown>;
    expect(result['token']).toBe('[SCRUBBED]');
  });

  it('masque les emails dans les strings', () => {
    const result = scrubObject({ message: 'Envoyé à user@example.com depuis app' }) as Record<string, unknown>;
    expect(result['message']).toContain('[email]');
    expect(result['message']).not.toContain('user@example.com');
  });

  it('scrube récursivement dans les objets imbriqués', () => {
    const result = scrubObject({
      user: { auth: { password: 'secret' } },
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result['user']['auth']['password']).toBe('[SCRUBBED]');
  });

  it('laisse les champs non-PII intacts', () => {
    const result = scrubObject({ action: 'biens:create', entity_id: 'uuid-123' }) as Record<string, unknown>;
    expect(result['action']).toBe('biens:create');
    expect(result['entity_id']).toBe('uuid-123');
  });
});

// ─── Tests : CorrelationId ────────────────────────────────────────────────────

describe('CorrelationIdMiddleware', () => {
  it('génère un UUID si X-Correlation-Id absent', async () => {
    const { CorrelationIdMiddleware } = await import('../../observability/correlation-id.middleware');
    const mw = new CorrelationIdMiddleware();

    const req = { headers: {} } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    mw.use(req, res, next);

    expect(req.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
    expect(next).toHaveBeenCalled();
  });

  it('préserve un X-Correlation-Id existant valide', async () => {
    const { CorrelationIdMiddleware } = await import('../../observability/correlation-id.middleware');
    const mw = new CorrelationIdMiddleware();

    const existing = '550e8400-e29b-41d4-a716-446655440000';
    const req = { headers: { 'x-correlation-id': existing } } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    mw.use(req, res, next);

    expect(req.headers['x-correlation-id']).toBe(existing);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', existing);
  });

  it('remplace un X-Correlation-Id invalide par un nouveau UUID', async () => {
    const { CorrelationIdMiddleware } = await import('../../observability/correlation-id.middleware');
    const mw = new CorrelationIdMiddleware();

    const req = { headers: { 'x-correlation-id': 'not-a-uuid' } } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    mw.use(req, res, next);

    expect(req.headers['x-correlation-id']).not.toBe('not-a-uuid');
    expect(req.headers['x-correlation-id']).toMatch(/^[0-9a-f]{8}-/i);
  });
});
