import { Injectable, Logger } from '@nestjs/common';
import type { Contact } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EmbeddingsService } from '../../ai/rag/embeddings.service';
import { OnDomainEvent } from '../../events/event-handler.decorator';
import type { DomainEvent } from '../../events/domain-event';

import {
  ContactEventType,
  type ContactCreatedPayload,
  type ContactMergedPayload,
  type ContactScoreChangedPayload,
  type ContactUpdatedPayload,
} from '../events/contact-events';

/**
 * Indexation pgvector des contacts pour Ask KURA.
 *
 * Règle non-négociable : on n'embed PAS le téléphone ni l'email
 * (limite l'exposition LLM en cas de RAG mal scopé).
 * On embed : nom, ville/commune, rôles, segments_ia, score, source, tags.
 *
 * Déclencheurs : contact.created / contact.updated / contact.merged /
 * contact.score_changed. L'archivage déclenche une suppression de l'index.
 */
@Injectable()
export class ContactsIndexerService {
  private readonly logger = new Logger(ContactsIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  @OnDomainEvent(ContactEventType.Created)
  async onContactCreated(event: DomainEvent<ContactCreatedPayload>): Promise<void> {
    await this.indexContact(event.payload.contact_id);
  }

  @OnDomainEvent(ContactEventType.Updated)
  async onContactUpdated(event: DomainEvent<ContactUpdatedPayload>): Promise<void> {
    await this.indexContact(event.payload.contact_id);
  }

  @OnDomainEvent(ContactEventType.ScoreChanged)
  async onContactScoreChanged(event: DomainEvent<ContactScoreChangedPayload>): Promise<void> {
    await this.indexContact(event.payload.contact_id);
  }

  @OnDomainEvent(ContactEventType.Merged)
  async onContactMerged(event: DomainEvent<ContactMergedPayload>): Promise<void> {
    // Index le master ; les sources sont archivées → on les drop
    await this.indexContact(event.payload.master_id);
    for (const id of event.payload.source_ids) {
      await this.dropIndex(id);
    }
  }

  @OnDomainEvent(ContactEventType.Archived)
  async onContactArchived(event: DomainEvent<{ contact_id: string }>): Promise<void> {
    await this.dropIndex(event.payload.contact_id);
  }

  async indexContact(contactId: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return;
    if (contact.archived_at) {
      await this.dropIndex(contactId);
      return;
    }

    const summary = this.buildSummary(contact);
    try {
      await this.embeddings.store({
        sourceType: 'contact',
        sourceId: contactId,
        text: summary,
      });
    } catch (err) {
      // Pas de re-throw : un échec d'indexation ne doit pas casser le flux métier
      this.logger.warn(
        `Indexation contact ${contactId} échouée : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Construit un résumé textuel SANS PII (pas d'email/téléphone) à embedder.
   * Format pensé pour des questions naturelles type "propriétaires VIP de Cocody".
   */
  buildSummary(contact: Contact): string {
    const parts: string[] = [];
    parts.push(`Contact: ${contact.nom}${contact.prenom ? ' ' + contact.prenom : ''}`);
    if (contact.roles.length > 0) parts.push(`Rôles: ${contact.roles.join(', ')}`);
    if (contact.ville || contact.commune) {
      parts.push(`Localisation: ${[contact.commune, contact.ville].filter(Boolean).join(', ')}`);
    }
    if (contact.pays) parts.push(`Pays: ${contact.pays}`);
    if (contact.source) parts.push(`Source: ${contact.source}`);
    if (contact.tags.length > 0) parts.push(`Tags: ${contact.tags.join(', ')}`);
    if (contact.segments_ia.length > 0) parts.push(`Segments: ${contact.segments_ia.join(', ')}`);
    if (contact.score_ia !== null) {
      parts.push(`Score IA: ${contact.score_ia} (${contact.score_categorie ?? 'n/a'})`);
    }
    if (contact.langue) parts.push(`Langue préférée: ${contact.langue}`);
    if (contact.derniere_interaction_at) {
      const days = Math.floor(
        (Date.now() - contact.derniere_interaction_at.getTime()) / (24 * 60 * 60 * 1000),
      );
      parts.push(`Dernière interaction il y a ${days} jour(s)`);
    } else {
      parts.push(`Aucune interaction enregistrée`);
    }
    return parts.join('. ') + '.';
  }

  private async dropIndex(contactId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM ai_embeddings
        WHERE source_type = 'contact' AND source_id = ${contactId}::uuid
      `;
    } catch (err) {
      this.logger.warn(
        `Suppression index contact ${contactId} échouée : ${(err as Error).message}`,
      );
    }
  }
}
