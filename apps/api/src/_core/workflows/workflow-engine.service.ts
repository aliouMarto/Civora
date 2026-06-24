import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { WorkflowRegistryService, type WorkflowDefinition } from './workflow-registry.service';
import { evaluateConditions } from './conditions/condition-evaluator';
import { SendNotificationAction } from './actions/send-notification.action';
import { EmitEventAction } from './actions/emit-event.action';
import { CallAiAction } from './actions/call-ai.action';
import type { ActionConfig, ActionResult } from './actions/action.interface';
import type { DomainEvent } from '../events/domain-event';
import { OnDomainEvent } from '../events/event-handler.decorator';

export interface RunContext {
  workflow_id: string;
  correlation_id?: string;
  trigger_event_id?: string;
  [key: string]: unknown;
}

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly registry: WorkflowRegistryService,
    private readonly sendNotif: SendNotificationAction,
    private readonly emitEvent: EmitEventAction,
    private readonly callAi: CallAiAction,
  ) {}

  /** Listener générique — déclenche les workflows pour chaque événement de domaine. */
  @OnDomainEvent('*')
  async onDomainEvent(event: DomainEvent): Promise<void> {
    if (!event.agence_id) return;

    const workflows = await this.registry.findByEventTrigger(event.agence_id, event.type);
    if (workflows.length === 0) return;

    for (const wf of workflows) {
      await this.tenantCtx.run(event.agence_id, async () => {
        const context: RunContext = {
          workflow_id: wf.id,
          trigger_event_id: event.id,
          correlation_id: (event.metadata as Record<string, unknown>)['correlation_id'] as string,
          event_type: event.type,
          aggregate_type: event.aggregate_type,
          aggregate_id: event.aggregate_id,
          payload: event.payload as Record<string, unknown>,
          params: wf.params,
        };
        await this.executeWorkflow(wf, context, false);
      });
    }
  }

  /** Exécute un workflow avec un contexte donné (réel ou dry-run). */
  async executeWorkflow(
    workflow: WorkflowDefinition,
    context: RunContext,
    dryRun: boolean,
  ): Promise<{ runId: string; status: string; actionsLog: ActionResult[] }> {
    const startedAt = new Date();

    // Évaluer les conditions
    const condResult = evaluateConditions(
      workflow.conditions,
      context as unknown as Record<string, unknown>,
    );

    if (!condResult.passed) {
      const run = await this.persistRun({
        workflow,
        context,
        status: 'skipped',
        conditionsResult: condResult,
        actionsLog: [],
        dryRun,
        startedAt,
      });
      this.logger.debug(`workflow ${workflow.code} skipped (conditions not met)`);
      return { runId: run.id, status: 'skipped', actionsLog: [] };
    }

    // Exécuter les actions en séquence
    const actionsLog: ActionResult[] = [];
    let overallStatus: 'success' | 'partial' | 'failed' = 'success';

    for (const actionConfig of workflow.actions) {
      const result = await this.executeAction(actionConfig, context as Record<string, unknown>, dryRun);
      actionsLog.push(result);
      if (result.status === 'failed') overallStatus = actionsLog.some((r) => r.status === 'success') ? 'partial' : 'failed';
    }

    const run = await this.persistRun({
      workflow,
      context,
      status: overallStatus,
      conditionsResult: condResult,
      actionsLog,
      dryRun,
      startedAt,
    });

    this.logger.log(`workflow ${workflow.code} ${dryRun ? '[DRY-RUN] ' : ''}→ ${overallStatus} (${actionsLog.length} actions)`);
    return { runId: run.id, status: overallStatus, actionsLog };
  }

  private async executeAction(
    config: ActionConfig,
    context: Record<string, unknown>,
    dryRun: boolean,
  ): Promise<ActionResult> {
    switch (config.kind) {
      case 'send-notification':
        return this.sendNotif.execute(config, context, dryRun);
      case 'emit-event':
        return this.emitEvent.execute(config, context, dryRun);
      case 'call-ai':
        return this.callAi.execute(config, context, dryRun);
      default:
        return { kind: (config as ActionConfig).kind, status: 'failed', error: `Action inconnue : ${(config as { kind: string }).kind}` };
    }
  }

  private async persistRun(params: {
    workflow: WorkflowDefinition;
    context: RunContext;
    status: string;
    conditionsResult: unknown;
    actionsLog: ActionResult[];
    dryRun: boolean;
    startedAt: Date;
  }) {
    return this.prisma.workflowRun.create({
      data: {
        agence_id: params.workflow.agence_id,
        workflow_id: params.workflow.id,
        workflow_version: params.workflow.version,
        trigger_event_id: params.context.trigger_event_id ?? null,
        status: params.status,
        conditions_result: params.conditionsResult as object,
        actions_log: params.actionsLog as unknown as object,
        dry_run: params.dryRun,
        started_at: params.startedAt,
        finished_at: new Date(),
      },
    });
  }
}
