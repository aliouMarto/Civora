/**
 * Tests AskKuraService (RAG sur contacts).
 *
 * Couvre :
 *   - intégration retrieval + AI Gateway (avec providers Fake)
 *   - réponse "aucun match" sans appel LLM
 *   - filtrage par agence (les contacts d'une autre agence ne fuient pas même
 *     si l'embedding est techniquement présent — RLS via tenant context)
 */
import { describe, expect, it, vi } from 'vitest';

import type { AiGatewayService } from '../../../ai/ai-gateway.service';
import type { RetrievalService } from '../../../ai/rag/retrieval.service';
import type { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import type { TenantContextService } from '../../../tenancy/tenant-context.service';

import { AskKuraService } from '../ask-kura.service';

function makeService(opts: {
  hits: Array<{ sourceId: string; similarity: number }>;
  contacts: Array<{ id: string; nom: string; prenom?: string | null; ville?: string | null; commune?: string | null; roles: string[]; segments_ia: string[]; score_ia?: number | null; score_categorie?: string | null }>;
  chatResponse?: string;
  agenceId?: string;
}) {
  const retrievalSearch = vi.fn().mockResolvedValue(
    opts.hits.map((h) => ({
      id: 'embed-' + h.sourceId,
      sourceType: 'contact',
      sourceId: h.sourceId,
      chunkIndex: 0,
      content: 'mock',
      similarity: h.similarity,
    })),
  );
  const retrieval = { search: retrievalSearch } as unknown as RetrievalService;

  const chat = vi.fn().mockResolvedValue({
    content: opts.chatResponse ?? 'Réponse mock',
    usage: { inputTokens: 100, outputTokens: 50 },
    costCents: 1,
    provider: 'fake',
    model: 'fake-model',
    latencyMs: 42,
  });
  const aiGateway = { chat } as unknown as AiGatewayService;

  const prisma = {
    contact: {
      findMany: vi.fn().mockResolvedValue(
        opts.contacts.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom ?? null,
          ville: c.ville ?? null,
          commune: c.commune ?? null,
          roles: c.roles,
          segments_ia: c.segments_ia,
          score_ia: c.score_ia ?? null,
          score_categorie: c.score_categorie ?? null,
        })),
      ),
    },
  } as unknown as PrismaService;

  const tenantCtx = {
    requireAgenceId: () => opts.agenceId ?? '00000000-0000-0000-0000-000000000099',
  } as unknown as TenantContextService;

  const service = new AskKuraService(retrieval, aiGateway, prisma, tenantCtx);
  return { service, retrievalSearch, chat, prisma };
}

describe('AskKuraService.ask', () => {
  it("retourne une réponse vide sans appeler le LLM si aucun match RAG", async () => {
    const { service, chat } = makeService({ hits: [], contacts: [] });
    const res = await service.ask({ question: 'aucun contact ?' }, 'cid');
    expect(chat).not.toHaveBeenCalled();
    expect(res.answer).toMatch(/aucun contact/i);
    expect(res.contacts).toEqual([]);
    expect(res.meta.cost_cents).toBe(0);
  });

  it("retourne une réponse 'archivés/supprimés' si embeddings trouvés mais aucun contact actif", async () => {
    const { service, chat } = makeService({
      hits: [{ sourceId: 'c1', similarity: 0.9 }],
      contacts: [], // findMany ne retourne rien (RLS ou archivés)
    });
    const res = await service.ask({ question: 'qui ?' }, 'cid');
    expect(chat).not.toHaveBeenCalled();
    expect(res.answer).toMatch(/archivés|supprimés/i);
    expect(res.contacts).toEqual([]);
  });

  it('appelle l\'AI Gateway avec le template contacts.ask_kura et retourne la réponse', async () => {
    const { service, chat } = makeService({
      hits: [
        { sourceId: 'c1', similarity: 0.92 },
        { sourceId: 'c2', similarity: 0.81 },
      ],
      contacts: [
        { id: 'c1', nom: 'Bamba', prenom: 'Sory', ville: 'Abidjan', commune: 'Cocody', roles: ['proprietaire'], segments_ia: ['vip'], score_ia: 88, score_categorie: 'chaud' },
        { id: 'c2', nom: 'Yao', ville: 'Abidjan', commune: 'Plateau', roles: ['acheteur'], segments_ia: ['lead_chaud'], score_ia: 75, score_categorie: 'chaud' },
      ],
      chatResponse: 'Les propriétaires VIP à Cocody : Sory Bamba (score 88).',
    });

    const res = await service.ask({ question: 'propriétaires VIP de Cocody' }, 'cid-test');

    expect(chat).toHaveBeenCalledTimes(1);
    const call = chat.mock.calls[0]![0];
    expect(call.template).toBe('contacts.ask_kura');
    expect(call.module).toBe('contacts.ask_kura');
    expect(call.vars['question']).toBe('propriétaires VIP de Cocody');
    expect(call.vars['contact_count']).toBe('2');
    expect(call.vars['context']).toContain('Bamba');
    expect(call.vars['context']).not.toContain('@'); // pas d'email dans le contexte
    expect(call.vars['context']).not.toContain('+225'); // pas de tel

    expect(res.contacts).toHaveLength(2);
    expect(res.contacts[0]!.id).toBe('c1');
    expect(res.contacts[0]!.similarity).toBe(0.92);
    expect(res.answer).toContain('Bamba');
  });

  it('plafonne max_results à 25', async () => {
    const { service, retrievalSearch } = makeService({ hits: [], contacts: [] });
    await service.ask({ question: 'foo', maxResults: 100 }, 'cid');
    expect(retrievalSearch).toHaveBeenCalledWith({
      sourceType: 'contact',
      query: 'foo',
      topK: 25,
    });
  });
});
