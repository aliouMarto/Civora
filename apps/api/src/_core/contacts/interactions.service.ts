import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EventBusService } from '../events/event-bus.service';
import { createDomainEvent } from '../events/domain-event';
import {
  InteractionEventType,
  type InteractionRecordedPayload,
} from './events/interaction-events';

import type { CreateInteractionDto } from './dto/create-interaction.dto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly eventBus: EventBusService,
  ) {}

  async record(
    contact_id: string,
    dto: CreateInteractionDto,
    user: JwtPayload,
  ): Promise<{ id: string; occurred_at: Date }> {
    const agence_id = this.tenantCtx.requireAgenceId();

    // Vérifier que le contact existe ET appartient à cette agence (RLS + check)
    const contact = await this.prisma.contact.findUnique({ where: { id: contact_id } });
    if (!contact || contact.agence_id !== agence_id) {
      throw new NotFoundException(`Contact ${contact_id} introuvable`);
    }

    const occurred_at = dto.occurred_at ?? new Date();
    const interaction = await this.prisma.withTenant(agence_id, async (tx) => {
      const created = await tx.interaction.create({
        data: {
          agence_id,
          contact_id,
          type: dto.type,
          direction: dto.direction ?? null,
          sujet: dto.sujet ?? null,
          contenu: dto.contenu ?? null,
          metadata: (dto.metadata ?? {}) as object,
          occurred_at,
          created_by: user.sub,
        },
      });
      // Mise à jour de derniere_interaction_at sur le contact (denormalisation)
      await tx.contact.update({
        where: { id: contact_id },
        data: { derniere_interaction_at: occurred_at },
      });
      return created;
    });

    const event = createDomainEvent({
      agence_id,
      type: InteractionEventType.Recorded,
      aggregate_type: 'Contact',
      aggregate_id: contact_id,
      payload: {
        interaction_id: interaction.id,
        contact_id,
        agence_id,
        actor_id: user.sub,
        type: dto.type,
        direction: dto.direction ?? null,
        occurred_at: occurred_at.toISOString(),
      } satisfies InteractionRecordedPayload,
      metadata: {
        actor_id: user.sub,
        correlation_id: randomUUID(),
        causation_id: null,
        ip: null,
        user_agent: null,
      },
    });
    await this.eventBus.emitInTx(event);

    return { id: interaction.id, occurred_at };
  }

  async listForContact(
    contact_id: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    // RLS filtre déjà mais double-check explicite
    const [items, total] = await Promise.all([
      this.prisma.interaction.findMany({
        where: { agence_id, contact_id },
        orderBy: { occurred_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.interaction.count({ where: { agence_id, contact_id } }),
    ]);
    return { items, total, page, limit };
  }
}
