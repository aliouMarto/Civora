/**
 * Tests d'idempotence des handlers.
 * Vérifie : un même event_id traité 2× par un handler → exécuté 1 seule fois.
 */
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { IdempotentHandlerService } from '../idempotent-handler.service';
import { EventHandlerRegistry } from '../event-handler-registry';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { createDomainEvent } from '../domain-event';

function makeEvent(overrides: { type?: string; agence_id?: string | null } = {}) {
  return createDomainEvent({
    agence_id: overrides.agence_id !== undefined ? overrides.agence_id : 'agence-uuid',
    type: overrides.type ?? 'bail.signe',
    aggregate_type: 'Bail',
    aggregate_id: 'bail-uuid',
    payload: {},
    metadata: { actor_id: 'user-1', correlation_id: 'corr-1', causation_id: null, ip: null, user_agent: null },
  });
}

describe('IdempotentHandlerService', () => {
  let svc: IdempotentHandlerService;
  let registry: EventHandlerRegistry;
  let mockPrisma: { eventHandlerOffset: { create: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    mockPrisma = {
      eventHandlerOffset: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const mockTenantCtx = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    const module = await Test.createTestingModule({
      providers: [
        IdempotentHandlerService,
        EventHandlerRegistry,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantContextService, useValue: mockTenantCtx },
      ],
    }).compile();

    svc = module.get(IdempotentHandlerService);
    registry = module.get(EventHandlerRegistry);
  });

  it('exécute le handler une fois pour un event_id donné', async () => {
    const handlerFn = vi.fn().mockResolvedValue(undefined);
    registry.register({ eventType: 'bail.signe', handlerName: 'TestHandler.handle', fn: handlerFn });

    const event = makeEvent();
    await svc.handle(event);

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(mockPrisma.eventHandlerOffset.create).toHaveBeenCalledWith({
      data: { handler_name: 'TestHandler.handle', event_id: event.id },
    });
  });

  it('ne s\'exécute PAS si l\'offset existe déjà (idempotence — event déjà traité)', async () => {
    const handlerFn = vi.fn().mockResolvedValue(undefined);
    registry.register({ eventType: 'bail.signe', handlerName: 'TestHandler.handleIdem', fn: handlerFn });

    // Simuler une contrainte PK violée (offset déjà présent)
    mockPrisma.eventHandlerOffset.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );

    const event = makeEvent();
    await svc.handle(event);

    // Le handler ne doit PAS être exécuté
    expect(handlerFn).not.toHaveBeenCalled();
  });

  it('gère plusieurs handlers pour le même type d\'événement', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    registry.register({ eventType: 'paiement.recu', handlerName: 'H1.handle', fn: handler1 });
    registry.register({ eventType: 'paiement.recu', handlerName: 'H2.handle', fn: handler2 });

    const event = makeEvent({ type: 'paiement.recu' });
    await svc.handle(event);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('ne s\'exécute pas si aucun handler enregistré pour ce type', async () => {
    const event = makeEvent({ type: 'evenement.inconnu' });
    // Ne doit pas lancer d'erreur
    await expect(svc.handle(event)).resolves.toBeUndefined();
    expect(mockPrisma.eventHandlerOffset.create).not.toHaveBeenCalled();
  });

  it('propage agence_id dans le TenantContext du handler', async () => {
    const mockTenantCtx = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    const module = await Test.createTestingModule({
      providers: [
        IdempotentHandlerService,
        EventHandlerRegistry,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantContextService, useValue: mockTenantCtx },
      ],
    }).compile();

    const svc2 = module.get(IdempotentHandlerService);
    const registry2 = module.get(EventHandlerRegistry);

    const handlerFn = vi.fn().mockResolvedValue(undefined);
    registry2.register({ eventType: 'bail.signe', handlerName: 'TenantHandler.handle', fn: handlerFn });

    const event = makeEvent({ agence_id: 'agence-A' });
    await svc2.handle(event);

    expect(mockTenantCtx.run).toHaveBeenCalledWith('agence-A', expect.any(Function));
  });

  it('n\'appelle pas TenantContext.run si agence_id est null (événement système)', async () => {
    const mockTenantCtx = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
    };

    const module = await Test.createTestingModule({
      providers: [
        IdempotentHandlerService,
        EventHandlerRegistry,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantContextService, useValue: mockTenantCtx },
      ],
    }).compile();

    const svc3 = module.get(IdempotentHandlerService);
    const registry3 = module.get(EventHandlerRegistry);

    const handlerFn = vi.fn().mockResolvedValue(undefined);
    registry3.register({ eventType: 'systeme.init', handlerName: 'SysHandler.handle', fn: handlerFn });

    const event = makeEvent({ type: 'systeme.init', agence_id: null });
    await svc3.handle(event);

    expect(mockTenantCtx.run).not.toHaveBeenCalled();
    expect(handlerFn).toHaveBeenCalledOnce();
  });
});
