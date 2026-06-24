import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngineService } from '../workflow-engine.service';
import { evaluateConditions } from '../conditions/condition-evaluator';
import type { WorkflowDefinition } from '../workflow-registry.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { TenantContextService } from '../../tenancy/tenant-context.service';
import type { WorkflowRegistryService } from '../workflow-registry.service';
import type { SendNotificationAction } from '../actions/send-notification.action';
import type { EmitEventAction } from '../actions/emit-event.action';
import type { CallAiAction } from '../actions/call-ai.action';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_WORKFLOW: WorkflowDefinition = {
  id: 'wf-uuid',
  agence_id: 'agence-abc',
  code: 'test.workflow',
  nom: 'Test Workflow',
  type: 'rule',
  statut: 'actif',
  trigger: { kind: 'event', event_type: 'bail.signe' },
  conditions: [{ field: 'payload.montant', op: '>', value: 100_000 }],
  actions: [
    {
      kind: 'send-notification',
      channel: 'email',
      template: 'invitation',
      vars: { nom: '{{payload.nom_locataire}}' },
      to_field: 'payload.email_locataire',
    },
  ],
  params: {},
  version: 1,
};

function makeEngine() {
  const mockCreate = vi.fn().mockResolvedValue({ id: 'run-uuid' });
  const mockPrisma = {
    workflowRun: { create: mockCreate },
  } as unknown as PrismaService;

  const mockTenantCtx = {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => Promise<void>) => fn()),
    getAgenceId: vi.fn().mockReturnValue('agence-abc'),
  } as unknown as TenantContextService;

  const mockRegistry = {
    findByEventTrigger: vi.fn().mockResolvedValue([BASE_WORKFLOW]),
  } as unknown as WorkflowRegistryService;

  const mockSendNotif = {
    execute: vi.fn().mockResolvedValue({ kind: 'send-notification', status: 'success' }),
  } as unknown as SendNotificationAction;

  const mockEmitEvent = {
    execute: vi.fn().mockResolvedValue({ kind: 'emit-event', status: 'success' }),
  } as unknown as EmitEventAction;

  const mockCallAi = {
    execute: vi.fn().mockResolvedValue({ kind: 'call-ai', status: 'success' }),
  } as unknown as CallAiAction;

  const engine = new WorkflowEngineService(
    mockPrisma,
    mockTenantCtx,
    mockRegistry,
    mockSendNotif,
    mockEmitEvent,
    mockCallAi,
  );

  return { engine, mockCreate, mockSendNotif, mockEmitEvent, mockRegistry };
}

// ─── Tests : evaluateConditions ───────────────────────────────────────────────

describe('evaluateConditions()', () => {
  it('retourne passed=true si toutes les conditions sont remplies', () => {
    const ctx = { payload: { montant: 150_000, statut: 'impaye' } };
    const result = evaluateConditions(
      [
        { field: 'payload.montant', op: '>', value: 100_000 },
        { field: 'payload.statut', op: '=', value: 'impaye' },
      ],
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it('retourne passed=false si une condition échoue (AND implicite)', () => {
    const ctx = { payload: { montant: 50_000, statut: 'impaye' } };
    const result = evaluateConditions(
      [{ field: 'payload.montant', op: '>', value: 100_000 }],
      ctx,
    );
    expect(result.passed).toBe(false);
  });

  it('évalue OR correctement', () => {
    const ctx = { payload: { canal: 'sms' } };
    const result = evaluateConditions(
      [{ or: [
        { field: 'payload.canal', op: '=', value: 'email' },
        { field: 'payload.canal', op: '=', value: 'sms' },
      ]}],
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it('opérateur in', () => {
    const ctx = { payload: { statut: 'impaye' } };
    const result = evaluateConditions(
      [{ field: 'payload.statut', op: 'in', value: ['impaye', 'retard'] }],
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it('opérateur not_in', () => {
    const ctx = { payload: { statut: 'paye' } };
    const result = evaluateConditions(
      [{ field: 'payload.statut', op: 'not_in', value: ['impaye', 'retard'] }],
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it('opérateur contains', () => {
    const ctx = { payload: { message: 'Bonjour Sory !' } };
    const result = evaluateConditions(
      [{ field: 'payload.message', op: 'contains', value: 'Sory' }],
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it('conditions vides → passed=true (pas de blocage)', () => {
    const result = evaluateConditions([], {});
    expect(result.passed).toBe(true);
  });
});

// ─── Tests : WorkflowEngineService ────────────────────────────────────────────

describe('WorkflowEngineService.executeWorkflow()', () => {
  it('exécute les actions quand les conditions passent → status success', async () => {
    const { engine, mockCreate, mockSendNotif } = makeEngine();

    const ctx = {
      workflow_id: 'wf-uuid',
      payload: { montant: 200_000, email_locataire: 'locataire@x.io', nom_locataire: 'Diallo' },
    };

    const result = await engine.executeWorkflow(BASE_WORKFLOW, ctx, false);

    expect(result.status).toBe('success');
    expect(mockSendNotif.execute).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'success', dry_run: false }) }),
    );
  });

  it('skipped quand les conditions ne passent pas', async () => {
    const { engine, mockCreate, mockSendNotif } = makeEngine();

    const ctx = {
      workflow_id: 'wf-uuid',
      payload: { montant: 50_000 }, // < 100 000 → condition échoue
    };

    const result = await engine.executeWorkflow(BASE_WORKFLOW, ctx, false);

    expect(result.status).toBe('skipped');
    expect(mockSendNotif.execute).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'skipped' }) }),
    );
  });

  it('dry-run : actions skipped, run persisted avec dry_run=true', async () => {
    const { engine, mockCreate, mockSendNotif } = makeEngine();
    mockSendNotif.execute = vi.fn().mockResolvedValue({ kind: 'send-notification', status: 'skipped', output: { dry_run: true } });

    const ctx = {
      workflow_id: 'wf-uuid',
      payload: { montant: 200_000 },
    };

    const result = await engine.executeWorkflow(BASE_WORKFLOW, ctx, true);

    expect(result.actionsLog[0]?.output).toMatchObject({ dry_run: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dry_run: true }) }),
    );
  });

  it('workflow inactif → aucun effet (registry ne le retourne pas)', async () => {
    const { engine, mockRegistry, mockSendNotif } = makeEngine();

    mockRegistry.findByEventTrigger = vi.fn().mockResolvedValue([]); // aucun actif

    const event = {
      id: 'evt-uuid',
      agence_id: 'agence-abc',
      type: 'bail.signe',
      version: 1,
      aggregate_type: 'Bail',
      aggregate_id: 'bail-uuid',
      payload: { montant: 200_000 },
      metadata: { actor_id: 'user-1', correlation_id: 'corr-1', causation_id: null, ip: null, user_agent: null },
      occurred_at: new Date(),
    };

    await engine.onDomainEvent(event);

    expect(mockSendNotif.execute).not.toHaveBeenCalled();
  });

  it('actions_log contient les résultats de chaque action', async () => {
    const { engine } = makeEngine();

    const wfWithTwo: WorkflowDefinition = {
      ...BASE_WORKFLOW,
      conditions: [],
      actions: [
        { kind: 'send-notification', channel: 'email', template: 'invitation', vars: {}, to_field: 'payload.email' },
        { kind: 'emit-event', event_type: 'relance.envoyee', payload_mapping: {} },
      ],
    };

    const result = await engine.executeWorkflow(
      wfWithTwo,
      { workflow_id: 'wf-uuid', payload: {} },
      false,
    );

    expect(result.actionsLog).toHaveLength(2);
    expect(result.actionsLog[0]!.kind).toBe('send-notification');
    expect(result.actionsLog[1]!.kind).toBe('emit-event');
  });
});
