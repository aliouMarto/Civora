import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import { EventBusService } from '../../events/event-bus.service';
import { OnDomainEvent } from '../../events/event-handler.decorator';
import { createDomainEvent, type DomainEvent } from '../../events/domain-event';
import { TenantContextService } from '../../tenancy/tenant-context.service';

import { ContactEventType, type ContactCreatedPayload, type ContactScoreChangedPayload, type ContactUpdatedPayload } from '../events/contact-events';
import { InteractionEventType, type InteractionRecordedPayload } from '../events/interaction-events';

import { ContactScoringService } from './contact-scoring.service';
import { SegmentationService } from './segmentation.service';

/**
 * Re-scoring + segmentation automatique des contacts.
 *
 * Déclencheurs (via @OnDomainEvent — discovery NestJS auto) :
 *   - contact.created
 *   - contact.updated
 *   - contact.interaction_recorded
 *
 * Pour chaque déclencheur :
 *   1. Calcule le score et persiste sur le contact.
 *   2. Calcule les segments_ia auto et persiste.
 *   3. Émet contact.score_changed UNIQUEMENT si delta ≥ 5 points ou catégorie a changé.
 *
 * Le contexte tenant est positionné en amont par IdempotentHandlerService
 * (cf event.agence_id) — pas besoin de le re-positionner ici.
 *
 * Pour la re-scoring nocturne des contacts non touchés depuis 7 jours, voir
 * ScoringScheduler (job cron BullMQ scheduled).
 */
@Injectable()
export class ContactScoringWorker {
  private readonly logger = new Logger(ContactScoringWorker.name);

  constructor(
    private readonly scoring: ContactScoringService,
    private readonly segmentation: SegmentationService,
    private readonly eventBus: EventBusService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  @OnDomainEvent(ContactEventType.Created)
  async onContactCreated(event: DomainEvent<ContactCreatedPayload>): Promise<void> {
    await this.rescore(event.payload.contact_id, event.metadata.actor_id, event.id);
  }

  @OnDomainEvent(ContactEventType.Updated)
  async onContactUpdated(event: DomainEvent<ContactUpdatedPayload>): Promise<void> {
    await this.rescore(event.payload.contact_id, event.metadata.actor_id, event.id);
  }

  @OnDomainEvent(InteractionEventType.Recorded)
  async onInteractionRecorded(
    event: DomainEvent<InteractionRecordedPayload>,
  ): Promise<void> {
    await this.rescore(event.payload.contact_id, event.metadata.actor_id, event.id);
  }

  /**
   * Pipeline complet : score → persiste → segmentation → émet score_changed si delta ≥ 5.
   * Expose pour tests + scheduler nocturne.
   */
  async rescore(
    contactId: string,
    actorId: string | null,
    causationId: string | null,
  ): Promise<void> {
    try {
      const update = await this.scoring.updateScore(contactId);
      await this.segmentation.refreshFor(contactId);

      if (update.changed) {
        const agenceId = this.tenantCtx.getAgenceId();
        if (!agenceId) {
          this.logger.warn(
            `Score changé pour ${contactId} mais pas de contexte tenant — event score_changed non émis`,
          );
          return;
        }
        const event = createDomainEvent({
          agence_id: agenceId,
          type: ContactEventType.ScoreChanged,
          aggregate_type: 'Contact',
          aggregate_id: contactId,
          payload: {
            contact_id: contactId,
            agence_id: agenceId,
            actor_id: actorId,
            score_before: update.previousScore,
            score_after: update.result.score,
            categorie_before: update.previousCategorie,
            categorie_after: update.result.category,
          } satisfies ContactScoreChangedPayload,
          metadata: {
            actor_id: actorId,
            correlation_id: randomUUID(),
            causation_id: causationId,
            ip: null,
            user_agent: null,
          },
        });
        await this.eventBus.emitInTx(event);
      } else {
        this.logger.debug(
          `Contact ${contactId} : score inchangé (delta < 5, même catégorie) — pas d'event`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Échec re-scoring contact ${contactId} : ${(err as Error).message}`,
      );
      // On ne re-throw pas : un échec de scoring ne doit pas bloquer le handler
    }
  }
}
