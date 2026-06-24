import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { TriggerConfig } from './triggers/trigger.interface';
import type { ConditionDsl } from './conditions/condition.interface';
import type { ActionConfig } from './actions/action.interface';

export interface WorkflowDefinition {
  id: string;
  agence_id: string;
  code: string;
  nom: string;
  type: string;
  statut: string;
  trigger: TriggerConfig;
  conditions: ConditionDsl;
  actions: ActionConfig[];
  params: Record<string, unknown>;
  version: number;
}

@Injectable()
export class WorkflowRegistryService {
  private readonly logger = new Logger(WorkflowRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Retourne tous les workflows actifs dont le trigger est un événement donné. */
  async findByEventTrigger(
    agence_id: string,
    event_type: string,
  ): Promise<WorkflowDefinition[]> {
    const rows = await this.prisma.workflow.findMany({
      where: {
        agence_id,
        statut: 'actif',
      },
    });

    return rows
      .filter((w) => {
        const trig = w.trigger as TriggerConfig;
        return trig.kind === 'event' && trig.event_type === event_type;
      })
      .map(toDefinition);
  }

  /** Retourne tous les workflows actifs avec trigger cron. */
  async findCronWorkflows(): Promise<WorkflowDefinition[]> {
    const rows = await this.prisma.workflow.findMany({
      where: { statut: 'actif' },
    });
    return rows
      .filter((w) => (w.trigger as TriggerConfig).kind === 'cron')
      .map(toDefinition);
  }

  /** Toggle statut actif/inactif et incrémente la version. */
  async toggleStatut(
    id: string,
    statut: 'actif' | 'inactif',
  ): Promise<WorkflowDefinition> {
    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { statut, version: { increment: 1 } },
    });
    this.logger.log(`workflow ${id} → ${statut} (v${updated.version})`);
    return toDefinition(updated);
  }

  async getById(id: string): Promise<WorkflowDefinition> {
    const w = await this.prisma.workflow.findUniqueOrThrow({ where: { id } });
    return toDefinition(w);
  }

  /** Met à jour les params et incrémente la version. */
  async updateParams(
    id: string,
    params: Record<string, unknown>,
  ): Promise<WorkflowDefinition> {
    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { params, version: { increment: 1 } },
    });
    return toDefinition(updated);
  }
}

function toDefinition(w: {
  id: string;
  agence_id: string;
  code: string;
  nom: string;
  type: string;
  statut: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  params: unknown;
  version: number;
}): WorkflowDefinition {
  return {
    id: w.id,
    agence_id: w.agence_id,
    code: w.code,
    nom: w.nom,
    type: w.type,
    statut: w.statut,
    trigger: w.trigger as TriggerConfig,
    conditions: w.conditions as ConditionDsl,
    actions: w.actions as ActionConfig[],
    params: w.params as Record<string, unknown>,
    version: w.version,
  };
}
