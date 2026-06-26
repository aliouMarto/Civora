import { Injectable, Logger } from '@nestjs/common';

import { AiGatewayService } from '../../ai/ai-gateway.service';
import { RetrievalService } from '../../ai/rag/retrieval.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';

export interface AskKuraInput {
  question: string;
  maxResults?: number;
}

export interface AskKuraContactRef {
  id: string;
  nom: string;
  prenom: string | null;
  ville: string | null;
  commune: string | null;
  roles: string[];
  segments_ia: string[];
  score_ia: number | null;
  score_categorie: string | null;
  similarity: number;
}

export interface AskKuraResponse {
  answer: string;
  contacts: AskKuraContactRef[];
  sources: { id: string; similarity: number }[];
  meta: {
    model: string;
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
  };
}

const DEFAULT_MAX = 10;
const HARD_MAX = 25;

@Injectable()
export class AskKuraService {
  private readonly logger = new Logger(AskKuraService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly aiGateway: AiGatewayService,
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ) {}

  async ask(input: AskKuraInput, correlationId: string): Promise<AskKuraResponse> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const topK = Math.min(input.maxResults ?? DEFAULT_MAX, HARD_MAX);

    // 1. Recherche pgvector — filtre source_type='contact' + RLS sur ai_embeddings
    const hits = await this.retrieval.search({
      sourceType: 'contact',
      query: input.question,
      topK,
    });

    if (hits.length === 0) {
      return {
        answer:
          "Aucun contact ne correspond à votre requête dans la base de l'agence. " +
          'Vérifiez que les contacts visés sont bien créés et que les filtres sont cohérents.',
        contacts: [],
        sources: [],
        meta: { model: 'none', latency_ms: 0, input_tokens: 0, output_tokens: 0, cost_cents: 0 },
      };
    }

    // 2. Charger les contacts complets (RLS s'applique — pas de cross-agence possible)
    const contactIds = hits.map((h) => h.sourceId);
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, agence_id, archived_at: null },
      select: {
        id: true,
        nom: true,
        prenom: true,
        ville: true,
        commune: true,
        roles: true,
        segments_ia: true,
        score_ia: true,
        score_categorie: true,
      },
    });

    // Conserver l'ordre de similarité
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const refs: AskKuraContactRef[] = hits
      .map((h) => {
        const c = byId.get(h.sourceId);
        if (!c) return null;
        return { ...c, similarity: h.similarity };
      })
      .filter((r): r is AskKuraContactRef => r !== null);

    if (refs.length === 0) {
      return {
        answer:
          "Les contacts indexés correspondants ne sont plus accessibles (archivés ou supprimés).",
        contacts: [],
        sources: hits.map((h) => ({ id: h.sourceId, similarity: h.similarity })),
        meta: { model: 'none', latency_ms: 0, input_tokens: 0, output_tokens: 0, cost_cents: 0 },
      };
    }

    // 3. Construire le contexte LLM (résumés textuels - PII déjà absente du résumé indexé)
    const context = refs
      .map(
        (r, i) =>
          `[${i + 1}] ${r.nom}${r.prenom ? ' ' + r.prenom : ''} ` +
          `(${[r.commune, r.ville].filter(Boolean).join(', ') || 'localisation inconnue'}) — ` +
          `rôles: ${r.roles.join(', ') || '∅'} — ` +
          `segments: ${r.segments_ia.join(', ') || '∅'} — ` +
          `score: ${r.score_ia ?? 'n/a'} (${r.score_categorie ?? 'n/a'}) — ` +
          `pertinence: ${(r.similarity * 100).toFixed(0)}%`,
      )
      .join('\n');

    // 4. Appel AI Gateway — anonymize:true du template masque toute PII résiduelle
    const chat = await this.aiGateway.chat({
      template: 'contacts.ask_kura',
      vars: {
        question: input.question,
        context,
        contact_count: String(refs.length),
      },
      module: 'contacts.ask_kura',
      correlationId,
    });

    return {
      answer: chat.content,
      contacts: refs,
      sources: hits.map((h) => ({ id: h.sourceId, similarity: h.similarity })),
      meta: {
        model: chat.model,
        latency_ms: chat.latencyMs,
        input_tokens: chat.usage.inputTokens,
        output_tokens: chat.usage.outputTokens,
        cost_cents: chat.costCents,
      },
    };
  }
}
