/**
 * Tests retry, DLQ, idempotence — testés via la méthode handle() interne.
 * On teste le comportement de BaseWorkerService sans instancier un vrai Worker BullMQ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TenantContextService } from '../../tenancy/tenant-context.service';
import { BaseWorkerService } from '../base-worker.service';
import { DeadLetterService } from '../dead-letter.service';
import type { DemoPingPayload } from '../job-types';
import type { QueueName } from '../queues.config';

// ─── Mock BullMQ — on ne démarre pas de vrai Worker ──────────────────────────
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Concrete worker minimal ──────────────────────────────────────────────────

class TestWorker extends BaseWorkerService<DemoPingPayload> {
  protected readonly queueName: QueueName = 'ai';
  readonly mockProcess = vi.fn<[unknown], Promise<unknown>>();

  async process(job: Parameters<BaseWorkerService['process']>[0]): Promise<unknown> {
    return this.mockProcess(job);
  }
}

// ─── Helper : expose la méthode privée handle() ───────────────────────────────
function getHandle(worker: TestWorker): (job: unknown) => Promise<unknown> {
  return (job: unknown) =>
    (worker as unknown as { handle(j: unknown): Promise<unknown> }).handle(job);
}

function makeJob(overrides: Partial<{
  id: string;
  name: string;
  agence_id: string | null;
  attemptsMade: number;
  opts: { attempts?: number };
}> = {}) {
  return {
    id: overrides.id ?? 'job-uuid',
    name: overrides.name ?? 'demo.ping',
    queueName: 'ai',
    data: {
      agence_id: overrides.agence_id !== undefined ? overrides.agence_id : 'agence-uuid',
      actor_id: 'user-1',
      correlation_id: 'corr-1',
      message: 'test',
    } as DemoPingPayload,
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: 3, ...overrides.opts },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaseWorkerService — logique interne handle()', () => {
  let worker: TestWorker;
  let mockDeadLetter: { record: ReturnType<typeof vi.fn> };
  let mockTenantCtx: { run: ReturnType<typeof vi.fn>; getAgenceId: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDeadLetter = { record: vi.fn().mockResolvedValue({}) };
    mockTenantCtx = {
      run: vi.fn().mockImplementation((_id: string, fn: () => unknown) => fn()),
      getAgenceId: vi.fn().mockReturnValue('agence-uuid'),
    };

    const mockConfig = { get: vi.fn().mockReturnValue('redis://localhost:6379') };

    worker = new TestWorker(
      mockConfig as never,
      mockTenantCtx as unknown as TenantContextService,
      mockDeadLetter as unknown as DeadLetterService,
    );
    worker.onModuleInit();
  });

  it('traite un job et retourne le résultat de process()', async () => {
    worker.mockProcess.mockResolvedValue({ pong: true });
    const result = await getHandle(worker)(makeJob());
    expect(worker.mockProcess).toHaveBeenCalledOnce();
    expect(result).toEqual({ pong: true });
  });

  it('propage agence_id dans TenantContextService pendant le traitement', async () => {
    worker.mockProcess.mockResolvedValue({});
    await getHandle(worker)(makeJob({ agence_id: 'agence-XYZ' }));
    expect(mockTenantCtx.run).toHaveBeenCalledWith('agence-XYZ', expect.any(Function));
  });

  it('ne lance pas TenantContext.run si agence_id est null', async () => {
    worker.mockProcess.mockResolvedValue({});
    await getHandle(worker)(makeJob({ agence_id: null }));
    expect(mockTenantCtx.run).not.toHaveBeenCalled();
    expect(worker.mockProcess).toHaveBeenCalledOnce();
  });

  it('re-throw l\'erreur pour que BullMQ gère le retry', async () => {
    worker.mockProcess.mockRejectedValue(new Error('erreur métier'));
    await expect(getHandle(worker)(makeJob())).rejects.toThrow('erreur métier');
  });

  it('idempotencyKey() retourne job.id par défaut', () => {
    const job = makeJob({ id: 'mon-id-unique' });
    const key = (worker as unknown as { idempotencyKey(j: unknown): string }).idempotencyKey(job);
    expect(key).toBe('mon-id-unique');
  });
});

describe('BaseWorkerService — logique DLQ', () => {
  function makeWorkerWithMocks() {
    const mockDeadLetter = { record: vi.fn().mockResolvedValue({}) };
    const mockConfig = { get: vi.fn().mockReturnValue('redis://localhost:6379') };
    const mockTenantCtx = {
      run: vi.fn().mockImplementation((_: string, fn: () => unknown) => fn()),
      getAgenceId: vi.fn(),
    };

    const w = new TestWorker(
      mockConfig as never,
      mockTenantCtx as never,
      mockDeadLetter as unknown as DeadLetterService,
    );
    w.onModuleInit();
    return { worker: w, mockDeadLetter };
  }

  it('enregistre en DLQ à la dernière tentative (attempts épuisés)', async () => {
    const { worker: w, mockDeadLetter } = makeWorkerWithMocks();
    const failedHandler = (w as unknown as {
      worker: { on: ReturnType<typeof vi.fn> }
    }).worker.on.mock.calls.find(([event]) => event === 'failed')?.[1] as
      ((job: unknown, err: Error) => Promise<void>) | undefined;

    if (!failedHandler) {
      // Appel direct du handler interne
      const error = new Error('fatal');
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      // Simuler l'appel direct du handler registered on 'failed'
      const onCalls = (w as unknown as { worker: { on: ReturnType<typeof vi.fn> } })
        .worker.on.mock.calls;
      const handler = onCalls.find(([ev]) => ev === 'failed')?.[1] as
        ((j: unknown, e: Error) => Promise<void>) | undefined;
      if (handler) await handler(job, error);
      expect(mockDeadLetter.record).toHaveBeenCalledWith(job, error);
    } else {
      const error = new Error('fatal');
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      await failedHandler(job, error);
      expect(mockDeadLetter.record).toHaveBeenCalledWith(job, error);
    }
  });

  it('n\'enregistre PAS en DLQ si ce n\'est pas la dernière tentative', async () => {
    const { worker: w, mockDeadLetter } = makeWorkerWithMocks();
    const onCalls = (w as unknown as { worker: { on: ReturnType<typeof vi.fn> } })
      .worker.on.mock.calls;
    const handler = onCalls.find(([ev]) => ev === 'failed')?.[1] as
      ((j: unknown, e: Error) => Promise<void>) | undefined;

    const error = new Error('temp');
    const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });

    if (handler) await handler(job, error);
    expect(mockDeadLetter.record).not.toHaveBeenCalled();
  });
});

describe('DeadLetterService', () => {
  it('insère la ligne dead-letter avec le bon contexte', async () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const svc = new DeadLetterService({ jobDeadLetter: { create: mockCreate } } as never);

    const error = new Error('boom');
    const job = {
      id: 'j1', name: 'demo.ping', queueName: 'ai',
      data: { agence_id: 'agence-uuid', actor_id: null, correlation_id: 'c1' },
      attemptsMade: 3,
    };

    await svc.record(job as never, error);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: 'ai', job_name: 'demo.ping', job_id: 'j1',
        error: 'boom', attempts: 3, agence_id: 'agence-uuid',
      }),
    });
  });

  it('absorbe les erreurs d\'insertion (évite la boucle infinie)', async () => {
    const svc = new DeadLetterService({
      jobDeadLetter: { create: vi.fn().mockRejectedValue(new Error('DB down')) },
    } as never);

    const job = {
      id: 'j2', name: 'x', queueName: 'ai',
      data: { agence_id: null, actor_id: null, correlation_id: 'c' },
      attemptsMade: 1,
    };

    await expect(svc.record(job as never, new Error('root'))).resolves.toBeUndefined();
  });
});
