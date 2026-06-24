/**
 * Tests configuration des files BullMQ et QueueManagerService.
 * On teste la logique de configuration statiquement + l'interface du manager.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QUEUE_NAMES, QUEUES } from '../queues.config';

// ─── Mock BullMQ minimaliste ─────────────────────────────────────────────────
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string, _opts: unknown) => ({
    _name: name,
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { QueueManagerService } from '../queue-manager.service';

function makeManager() {
  const mockConfig = {
    get: vi.fn().mockReturnValue('redis://localhost:6379'),
  };
  // Instanciation directe sans NestJS DI
  const svc = new QueueManagerService(mockConfig as never);
  svc.onModuleInit();
  return svc;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QUEUES config (valeurs statiques)', () => {
  it('définit exactement 8 files', () => {
    expect(QUEUE_NAMES).toHaveLength(8);
    expect(Object.keys(QUEUES)).toHaveLength(8);
  });

  it('payments a plus d\'attempts que les autres (file critique)', () => {
    expect(QUEUES.payments.attempts).toBeGreaterThan(QUEUES.pdf.attempts);
    expect(QUEUES.payments.attempts).toBeGreaterThan(QUEUES.ai.attempts);
    expect(QUEUES.payments.attempts).toBe(10);
  });

  it('tous les backoffs sont de type exponentiel', () => {
    for (const cfg of Object.values(QUEUES)) {
      expect(cfg.backoff.type).toBe('exponential');
      expect(cfg.backoff.delay).toBeGreaterThan(0);
    }
  });

  it('ai a la plus haute concurrence (traitement LLM parallèle)', () => {
    expect(QUEUES.ai.concurrency).toBeGreaterThanOrEqual(QUEUES.payments.concurrency);
  });

  it('chaque file a concurrency > 0 et attempts > 0', () => {
    for (const [name, cfg] of Object.entries(QUEUES)) {
      expect(cfg.concurrency, `${name}.concurrency`).toBeGreaterThan(0);
      expect(cfg.attempts, `${name}.attempts`).toBeGreaterThan(0);
    }
  });
});

describe('QueueManagerService', () => {
  let svc: QueueManagerService;

  beforeEach(() => {
    svc = makeManager();
  });

  it('initialise 8 queues', () => {
    expect(svc.getAll()).toHaveLength(8);
  });

  it('retourne la Queue pour chaque nom valide', () => {
    for (const name of QUEUE_NAMES) {
      expect(svc.get(name)).toBeDefined();
    }
  });

  it('lève une erreur pour un nom inconnu', () => {
    expect(() => svc.get('inconnu' as never)).toThrow(/non initialisée/);
  });

  it('add() appelle queue.add avec jobId', async () => {
    const queue = svc.get('ai');
    const addSpy = vi.spyOn(queue, 'add').mockResolvedValue({ id: 'job-42' } as never);

    const jobId = await svc.add('ai', 'demo.ping', {
      agence_id: 'agence-uuid',
      actor_id: 'user-1',
      correlation_id: 'corr-1',
    }, { jobId: 'idem-key' });

    expect(addSpy).toHaveBeenCalledWith(
      'demo.ping',
      expect.objectContaining({ agence_id: 'agence-uuid' }),
      expect.objectContaining({ jobId: 'idem-key' }),
    );
    expect(jobId).toBe('job-42');
  });

  it('ferme toutes les queues à la destruction', async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    for (const q of svc.getAll()) {
      vi.spyOn(q, 'close').mockImplementation(closeSpy);
    }

    await svc.onModuleDestroy();

    expect(closeSpy).toHaveBeenCalledTimes(8);
  });
});
