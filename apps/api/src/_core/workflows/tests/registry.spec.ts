import { describe, it, expect, vi } from 'vitest';
import { WorkflowRegistryService } from '../workflow-registry.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

function makeRegistry(workflows: object[] = []) {
  const mockPrisma = {
    workflow: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where?: { statut?: string } }) => {
        if (where?.statut) return workflows.filter((w: any) => w.statut === where.statut);
        return workflows;
      }),
      update: vi.fn().mockImplementation(async ({ data }: { data: { statut?: string; version?: { increment: number } } }) => ({
        id: 'wf-uuid',
        agence_id: 'agence-abc',
        code: 'test.wf',
        nom: 'Test',
        type: 'rule',
        statut: data.statut ?? 'actif',
        trigger: { kind: 'event', event_type: 'bail.signe' },
        conditions: [],
        actions: [],
        params: {},
        version: 2,
      })),
    },
  } as unknown as PrismaService;

  return { registry: new WorkflowRegistryService(mockPrisma), mockPrisma };
}

const ACTIVE_EVENT_WF = {
  id: 'wf-1',
  agence_id: 'agence-abc',
  code: 'relance.impayes',
  nom: 'Relance impayés',
  type: 'rule',
  statut: 'actif',
  trigger: { kind: 'event', event_type: 'bail.signe' },
  conditions: [],
  actions: [],
  params: {},
  version: 1,
};

const INACTIVE_WF = { ...ACTIVE_EVENT_WF, id: 'wf-2', statut: 'inactif' };

const CRON_WF = {
  ...ACTIVE_EVENT_WF,
  id: 'wf-3',
  trigger: { kind: 'cron', cron: '0 9 * * 1' },
};

describe('WorkflowRegistryService', () => {
  it('findByEventTrigger retourne les workflows actifs correspondant au type', async () => {
    const { registry } = makeRegistry([ACTIVE_EVENT_WF, INACTIVE_WF]);

    const results = await registry.findByEventTrigger('agence-abc', 'bail.signe');

    // INACTIVE_WF filtré par statut='actif'
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('relance.impayes');
  });

  it('findByEventTrigger ignore les workflows avec trigger différent', async () => {
    const wrongEvent = { ...ACTIVE_EVENT_WF, trigger: { kind: 'event', event_type: 'paiement.recu' } };
    const { registry } = makeRegistry([ACTIVE_EVENT_WF, wrongEvent]);

    const results = await registry.findByEventTrigger('agence-abc', 'bail.signe');
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('relance.impayes');
  });

  it('findCronWorkflows retourne uniquement les workflows cron actifs', async () => {
    const { registry } = makeRegistry([ACTIVE_EVENT_WF, CRON_WF]);

    const results = await registry.findCronWorkflows();

    expect(results).toHaveLength(1);
    expect((results[0]!.trigger as { kind: string }).kind).toBe('cron');
  });

  it('toggleStatut appelle prisma.update avec le bon statut', async () => {
    const { registry, mockPrisma } = makeRegistry();

    await registry.toggleStatut('wf-uuid', 'inactif');

    expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wf-uuid' },
        data: { statut: 'inactif', version: { increment: 1 } },
      }),
    );
  });

  it('toggleStatut retourne la définition mise à jour', async () => {
    const { registry } = makeRegistry();

    const result = await registry.toggleStatut('wf-uuid', 'inactif');
    expect(result.version).toBe(2);
    expect(result.statut).toBe('inactif');
  });
});
