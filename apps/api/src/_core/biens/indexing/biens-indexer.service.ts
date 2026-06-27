import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingsService } from '../../ai/rag/embeddings.service';
import { OnDomainEvent } from '../../events/event-handler.decorator';
import type { DomainEvent } from '../../events/domain-event';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { BienEventType } from '../events/bien-events';

/**
 * Indexe les biens dans pgvector pour le RAG "Ask KURA Biens".
 *
 * Important sécurité : le résumé indexé NE CONTIENT PAS d'adresse précise
 * (adresse_ligne1 / latitude / longitude). On expose seulement commune,
 * type, surface, statut, prix — ce qui suffit au LLM pour répondre sans
 * exfiltrer de PII détaillée.
 */
@Injectable()
export class BiensIndexerService {
  private readonly logger = new Logger(BiensIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  @OnDomainEvent(BienEventType.Created)
  async onCreated(event: DomainEvent<{ bien_id: string }>): Promise<void> {
    await this.indexBien(event.agence_id, event.payload.bien_id);
  }

  @OnDomainEvent(BienEventType.Updated)
  async onUpdated(event: DomainEvent<{ bien_id: string }>): Promise<void> {
    await this.indexBien(event.agence_id, event.payload.bien_id);
  }

  private async indexBien(agence_id: string | null, bien_id: string): Promise<void> {
    if (!agence_id) return;
    try {
      await this.tenantCtx.run(agence_id, async () => {
        const bien = await this.prisma.bien.findUnique({ where: { id: bien_id } });
        if (!bien || bien.agence_id !== agence_id || bien.archived_at) return;
        const summary = this.buildSummary(bien);
        await this.embeddings.store({
          sourceType: 'bien',
          sourceId: bien.id,
          text: summary,
        });
      });
      this.logger.debug(`Indexé bien ${bien_id}`);
    } catch (err) {
      // Pas critique : un échec d'embedding ne doit pas casser le flux métier.
      this.logger.warn(`Échec indexation bien ${bien_id}: ${(err as Error).message}`);
    }
  }

  /**
   * Construit le résumé indexé. Aucune adresse précise — uniquement commune.
   * Le LLM reçoit donc juste assez pour répondre aux questions de
   * portefeuille sans risque d'exfiltration d'adresse.
   */
  private buildSummary(b: {
    nom: string;
    type: string;
    usage: string;
    statut: string;
    commune: string | null;
    ville: string;
    surface: { toString(): string } | null;
    chambres: number | null;
    loyer_mensuel_xof: bigint | null;
    prix_vente_xof: bigint | null;
    amenities: string[];
    tags: string[];
    score_ia: number | null;
    score_occupation: string | null;
  }): string {
    const parts: string[] = [];
    parts.push(`Bien : ${b.nom}`);
    parts.push(`Type : ${b.type}, usage ${b.usage}`);
    parts.push(`Statut : ${b.statut}`);
    parts.push(`Localisation : ${b.commune ?? b.ville}, Côte d'Ivoire`);
    if (b.surface) parts.push(`Surface : ${b.surface.toString()} m²`);
    if (b.chambres !== null) parts.push(`${b.chambres} chambre(s)`);
    if (b.loyer_mensuel_xof) {
      parts.push(`Loyer mensuel : ${Number(b.loyer_mensuel_xof) / 100} FCFA`);
    }
    if (b.prix_vente_xof) {
      parts.push(`Prix de vente : ${Number(b.prix_vente_xof) / 100} FCFA`);
    }
    if (b.amenities.length > 0) parts.push(`Équipements : ${b.amenities.join(', ')}`);
    if (b.tags.length > 0) parts.push(`Tags : ${b.tags.join(', ')}`);
    if (b.score_ia !== null) {
      parts.push(`Score IA : ${b.score_ia}/100 (occupation ${b.score_occupation ?? '?'})`);
    }
    return parts.join('. ');
  }
}
