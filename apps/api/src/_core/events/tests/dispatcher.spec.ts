/**
 * Tests OutboxDispatcherService.
 * Vérifie : publication BullMQ, marquage published_at, backoff sur erreur.
 *
 * Stratégie de mock : on spy sur getOrCreateQueue() pour injecter un faux queue,
 * évitant les complexités de hoisting vi.mock pour BullMQ.
 */
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OutboxDispatcherService } from '../outbox-dispatcher.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

// BullMQ Queue est instancié dans getOrCreateQueue — on mocke la méthode privée
// plutôt que le module pour éviter les problèmes de hoisting Vitest.
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({})),
}));

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeStoredEvent(overrides: Partial<{
  id: string; type: string; agence_id: string | null; attempts: number;
}> = {}) {
  return {
    id: 'event-uuid',
    type: 'bail.signe',
    agence_id: 'agence-uuid',
    attempts: 0,
    published_at: null,
    payload: {},
    metadata: {},
    aggregate_type: 'Bail',
    aggregate_id: 'bail-uuid',
    occurred_at: new Date(),
    version: 1,
    last_error: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OutboxDispatcherService', () => {
  let svc: OutboxDispatcherService;
  let mockAdd: ReturnType<typeof vi.fn>;
  let mockPrisma: {
    domainEvent: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    mockAdd = vi.fn().mockResolvedValue({});

    mockPrisma = {
      domainEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockConfig = {
      // Intervalle très long pour éviter que le timer se déclenche pendant les tests
      get: vi.fn((key: string) => {
        if (key === 'OUTBOX_POLL_INTERVAL_MS') return 999_999;
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        return undefined;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        OutboxDispatcherService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get(OutboxDispatcherService);

    // Spy sur getOrCreateQueue pour injecter un faux queue sans connexion Redis
    vi.spyOn(
      svc as unknown as { getOrCreateQueue(name: string): { add: typeof mockAdd; close: () => void } },
      'getOrCreateQueue',
    ).mockReturnValue({ add: mockAdd, close: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ne fait rien si aucun événement en attente', async () => {
    await svc.dispatch();
    expect(mockPrisma.domainEvent.update).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('publie l\'événement sur BullMQ et marque published_at', async () => {
    const event = makeStoredEvent();
    mockPrisma.domainEvent.findMany.mockResolvedValue([event]);

    await svc.dispatch();

    // add() appelé avec le jobId = event.id (idempotence BullMQ)
    expect(mockAdd).toHaveBeenCalledOnce();
    const [eventType, , opts] = mockAdd.mock.calls[0] as [string, unknown, { jobId: string }];
    expect(eventType).toBe('bail.signe');
    expect(opts.jobId).toBe(event.id);

    // published_at mis à jour en base
    expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: { published_at: expect.any(Date) },
    });
  });

  it('incrémente attempts et log last_error si publication échoue', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Redis down'));

    const event = makeStoredEvent({ attempts: 2 });
    mockPrisma.domainEvent.findMany.mockResolvedValue([event]);

    await svc.dispatch();

    expect(mockPrisma.domainEvent.update).toHaveBeenCalledWith({
      where: { id: event.id },
      data: { attempts: 3, last_error: 'Redis down' },
    });

    // published_at ne doit PAS apparaître dans l'update d'échec
    const call = mockPrisma.domainEvent.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.published_at).toBeUndefined();
  });

  it('utilise jobId = event.id pour l\'idempotence BullMQ', async () => {
    const event = makeStoredEvent({ id: 'unique-event-id-42' });
    mockPrisma.domainEvent.findMany.mockResolvedValue([event]);

    await svc.dispatch();

    const [, , opts] = mockAdd.mock.calls[0] as [string, unknown, { jobId: string }];
    expect(opts.jobId).toBe('unique-event-id-42');
  });

  it('traite plusieurs événements en batch', async () => {
    const events = [
      makeStoredEvent({ id: 'ev-1', type: 'bail.signe' }),
      makeStoredEvent({ id: 'ev-2', type: 'paiement.recu' }),
    ];
    mockPrisma.domainEvent.findMany.mockResolvedValue(events);

    await svc.dispatch();

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockPrisma.domainEvent.update).toHaveBeenCalledTimes(2);
  });
});
