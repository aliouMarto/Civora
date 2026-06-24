import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../events/event-handler.decorator';
import { RealtimeService } from './realtime.service';
import { event } from './channels';
import type { DomainEvent } from '../events/domain-event';

@Injectable()
export class LiveFeedProjector {
  private readonly logger = new Logger(LiveFeedProjector.name);

  constructor(private readonly realtime: RealtimeService) {}

  @OnDomainEvent('bail.signe')
  async onBailSigne(domainEvent: DomainEvent): Promise<void> {
    this.project(domainEvent);
  }

  @OnDomainEvent('paiement.recu')
  async onPaiementRecu(domainEvent: DomainEvent): Promise<void> {
    this.project(domainEvent);
  }

  @OnDomainEvent('reservation.confirmee')
  async onReservationConfirmee(domainEvent: DomainEvent): Promise<void> {
    this.project(domainEvent);
  }

  @OnDomainEvent('bien.publie')
  async onBienPublie(domainEvent: DomainEvent): Promise<void> {
    this.project(domainEvent);
  }

  @OnDomainEvent('contact.cree')
  async onContactCree(domainEvent: DomainEvent): Promise<void> {
    this.project(domainEvent);
  }

  private project(domainEvent: DomainEvent): void {
    if (!domainEvent.agence_id) return;

    this.realtime.emitToTenant(domainEvent.agence_id, event.ACTIVITY_LIVE, {
      type: domainEvent.type,
      aggregate_type: domainEvent.aggregate_type,
      aggregate_id: domainEvent.aggregate_id,
      occurred_at: domainEvent.occurred_at.toISOString(),
      actor_id: (domainEvent.metadata as Record<string, unknown>)['actor_id'] ?? null,
    });

    this.logger.debug(`live feed: ${domainEvent.type} → tenant.${domainEvent.agence_id}`);
  }
}
