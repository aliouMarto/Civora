import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type ActorType = 'user' | 'system' | 'job';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorType?: ActorType;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: {
    ip?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
    [key: string]: unknown;
  };
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  /**
   * Insère une entrée dans le journal d'audit.
   * INSERT uniquement — jamais d'UPDATE ni de DELETE (contrainte DB + trigger).
   */
  async log(entry: AuditEntry): Promise<void> {
    const agence_id = this.tenantCtx.getAgenceId() ?? null;

    try {
      await this.prisma.auditLog.create({
        data: {
          agence_id,
          actor_id: entry.actorId ?? null,
          actor_type: entry.actorType ?? 'user',
          action: entry.action,
          entity_type: entry.entityType ?? null,
          entity_id: entry.entityId ?? null,
          before: (entry.before as object) ?? null,
          after: (entry.after as object) ?? null,
          metadata: (entry.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      // Ne jamais laisser un échec d'audit bloquer le flux applicatif
      this.logger.error(`audit.log failed for action="${entry.action}": ${(err as Error).message}`);
    }
  }
}
