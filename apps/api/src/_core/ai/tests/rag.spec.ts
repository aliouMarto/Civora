import { describe, it, expect, vi } from 'vitest';
import { chunkText } from '../rag/chunking';
import { EmbeddingsService } from '../rag/embeddings.service';
import { RetrievalService } from '../rag/retrieval.service';
import { FakeAiProvider } from '../providers/fake.provider';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { TenantContextService } from '../../tenancy/tenant-context.service';
import type { AiRouter } from '../providers/router';

// ─── chunkText ─────────────────────────────────────────────────────────────

describe('chunkText()', () => {
  it('découpe un texte long en plusieurs chunks', () => {
    const text = 'a'.repeat(1200);
    const chunks = chunkText(text, 512, 64);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunk unique pour un texte court', () => {
    const chunks = chunkText('bonjour', 512);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.index).toBe(0);
  });

  it('les chunks se chevauchent (overlap)', () => {
    const text = 'a'.repeat(600);
    const chunks = chunkText(text, 512, 64);
    // Le deuxième chunk commence à 512 - 64 = 448
    expect(chunks[1]!.content.length).toBeGreaterThan(0);
  });

  it('filtre les chunks vides', () => {
    const chunks = chunkText('   ', 512);
    expect(chunks).toHaveLength(0);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRagDeps(agence_id = 'agence-abc') {
  const fakeProvider = new FakeAiProvider();

  const mockPrisma = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const mockTenantCtx = {
    requireAgenceId: vi.fn().mockReturnValue(agence_id),
  } as unknown as TenantContextService;

  const mockRouter = {
    route: vi.fn().mockReturnValue({ primary: fakeProvider, fallback: null }),
  } as unknown as AiRouter;

  const embedSvc = new EmbeddingsService(mockPrisma, mockTenantCtx, mockRouter);
  const retrievalSvc = new RetrievalService(mockPrisma, mockTenantCtx, mockRouter);

  return { embedSvc, retrievalSvc, mockPrisma, mockTenantCtx, fakeProvider };
}

// ─── EmbeddingsService ────────────────────────────────────────────────────────

describe('EmbeddingsService.store()', () => {
  it('supprime les anciens embeddings et insère les nouveaux chunks', async () => {
    const { embedSvc, mockPrisma } = makeRagDeps();

    await embedSvc.store({
      sourceType: 'document',
      sourceId: 'doc-uuid',
      text: 'Contrat de bail pour appartement à Cocody. '.repeat(5),
    });

    // DELETE puis INSERT pour chaque chunk
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM ai_embeddings'),
      'agence-abc',
      'document',
      'doc-uuid',
    );
    // Au moins un INSERT
    const calls = (mockPrisma.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls;
    const inserts = calls.filter(([sql]: [string]) => sql.includes('INSERT INTO ai_embeddings'));
    expect(inserts.length).toBeGreaterThan(0);
  });

  it('le vecteur inséré a 1536 dimensions', async () => {
    const { embedSvc, mockPrisma } = makeRagDeps();

    await embedSvc.store({ sourceType: 'bien', sourceId: 'b1', text: 'test document' });

    const insertCall = (mockPrisma.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => sql.includes('INSERT INTO ai_embeddings'),
    );

    expect(insertCall).toBeDefined();
    const vectorArg: string = insertCall![6]; // $6 = vecteur (index 0 = SQL string, 1=$1…)
    const dims = vectorArg.replace('[', '').replace(']', '').split(',').length;
    expect(dims).toBe(1536);
  });
});

// ─── RetrievalService ────────────────────────────────────────────────────────

describe('RetrievalService.search()', () => {
  it('retourne les résultats de la requête pgvector', async () => {
    const { retrievalSvc, mockPrisma } = makeRagDeps('agence-abc');

    (mockPrisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'emb-1',
        source_type: 'document',
        source_id: 'doc-1',
        chunk_index: 0,
        content: 'Contrat de bail',
        similarity: 0.92,
      },
    ]);

    const results = await retrievalSvc.search({ query: 'bail', topK: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]!.similarity).toBe(0.92);
    expect(results[0]!.sourceType).toBe('document');
  });

  it('isolation tenant : la requête filtre par agence_id', async () => {
    const { retrievalSvc, mockPrisma } = makeRagDeps('agence-A');

    await retrievalSvc.search({ query: 'test', topK: 5 });

    const call = (mockPrisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    // Le 2e argument est agence_id
    expect(call[2]).toBe('agence-A');
  });
});
