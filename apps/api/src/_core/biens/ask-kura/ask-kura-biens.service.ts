import { Injectable, Logger } from '@nestjs/common';

import { AiGatewayService } from '../../ai/ai-gateway.service';
import { RetrievalService } from '../../ai/rag/retrieval.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';

export interface AskKuraBiensInput {
  question: string;
  maxResults?: number;
}

export interface AskKuraBienRef {
  id: string;
  reference: string;
  nom: string;
  type: string;
  usage: string;
  statut: string;
  commune: string | null;
  ville: string;
  surface: string | null;
  chambres: number | null;
  loyer_mensuel_xof: string | null;     // BigInt → string
  prix_vente_xof: string | null;
  score_ia: number | null;
  similarity: number;
}

export interface AskKuraBiensResponse {
  answer: string;
  biens: AskKuraBienRef[];
  sources: Array<{ id: string; similarity: number }>;
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
export class AskKuraBiensService {
  private readonly logger = new Logger(AskKuraBiensService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly aiGateway: AiGatewayService,
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async ask(input: AskKuraBiensInput, correlationId: string): Promise<AskKuraBiensResponse> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const topK = Math.min(input.maxResults ?? DEFAULT_MAX, HARD_MAX);

    // 1. Retrieval pgvector — RLS sur ai_embeddings → pas de cross-agence
    const hits = await this.retrieval.search({
      sourceType: 'bien',
      query: input.question,
      topK,
    });

    if (hits.length === 0) {
      return {
        answer: "Je n'ai trouvé aucun bien indexé correspondant à votre question.",
        biens: [],
        sources: [],
        meta: { model: 'none', latency_ms: 0, input_tokens: 0, output_tokens: 0, cost_cents: 0 },
      };
    }

    // 2. Charger les biens complets (RLS s'applique)
    const ids = hits.map((h) => h.sourceId);
    const biens = await this.prisma.bien.findMany({
      where: { id: { in: ids }, agence_id, archived_at: null },
      select: {
        id: true, reference: true, nom: true, type: true, usage: true, statut: true,
        commune: true, ville: true, surface: true, chambres: true,
        loyer_mensuel_xof: true, prix_vente_xof: true, score_ia: true,
      },
    });

    const byId = new Map(biens.map((b) => [b.id, b]));
    const refs: AskKuraBienRef[] = hits
      .map((h) => {
        const b = byId.get(h.sourceId);
        if (!b) return null;
        return {
          id: b.id,
          reference: b.reference,
          nom: b.nom,
          type: b.type,
          usage: b.usage,
          statut: b.statut,
          commune: b.commune,
          ville: b.ville,
          surface: b.surface?.toString() ?? null,
          chambres: b.chambres,
          loyer_mensuel_xof: b.loyer_mensuel_xof?.toString() ?? null,
          prix_vente_xof: b.prix_vente_xof?.toString() ?? null,
          score_ia: b.score_ia,
          similarity: h.similarity,
        };
      })
      .filter((r): r is AskKuraBienRef => r !== null);

    if (refs.length === 0) {
      return {
        answer:
          "Les biens indexés correspondants ne sont plus accessibles (archivés ou supprimés).",
        biens: [],
        sources: hits.map((h) => ({ id: h.sourceId, similarity: h.similarity })),
        meta: { model: 'none', latency_ms: 0, input_tokens: 0, output_tokens: 0, cost_cents: 0 },
      };
    }

    // 3. Construire le contexte (jamais d'adresse précise — règle non négo)
    const context = refs
      .map((r, i) => {
        const surfaceFr = r.surface ? `${r.surface} m²` : 'surface inconnue';
        const loyerFr = r.loyer_mensuel_xof
          ? `${(Number(r.loyer_mensuel_xof) / 100).toLocaleString('fr-FR')} FCFA/mois`
          : 'pas de loyer';
        const prixFr = r.prix_vente_xof
          ? `${(Number(r.prix_vente_xof) / 100).toLocaleString('fr-FR')} FCFA`
          : 'pas en vente';
        return (
          `[${i + 1}] ${r.reference} — ${r.nom} (${r.type}, ${r.usage}, ${r.statut}) — ` +
          `${[r.commune, r.ville].filter(Boolean).join(', ')} — ` +
          `${surfaceFr}, ${r.chambres ?? '?'} chambres — ` +
          `loyer: ${loyerFr}, vente: ${prixFr} — ` +
          `score: ${r.score_ia ?? 'n/a'}/100 — ` +
          `pertinence: ${(r.similarity * 100).toFixed(0)}%`
        );
      })
      .join('\n');

    // 4. Appel AI Gateway
    const chat = await this.aiGateway.chat({
      template: 'biens.ask_kura',
      vars: { question: input.question, context, bien_count: String(refs.length) },
      module: 'biens.ask_kura',
      correlationId,
    });

    return {
      answer: chat.content,
      biens: refs,
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
