/**
 * Vérifie l'anti-bruit sur l'émission contact.score_changed :
 *   - delta < 5 ET même catégorie  → pas d'event
 *   - delta ≥ 5  → event émis
 *   - changement de catégorie (même avec delta < 5) → event émis
 */
import { describe, expect, it, vi } from 'vitest';

import { ContactScoringWorker } from '../scoring.worker';

describe('ContactScoringWorker — anti-bruit score_changed', () => {
  function makeWorker(updateResult: {
    changed: boolean;
    previousScore: number | null;
    previousCategorie: string | null;
    score: number;
    category: string;
  }) {
    const emitInTx = vi.fn().mockResolvedValue(undefined);
    const updateScore = vi.fn().mockResolvedValue({
      result: {
        score: updateResult.score,
        category: updateResult.category as 'froid' | 'tiede' | 'chaud',
        confidence: 'low' as const,
        factors: [],
      },
      changed: updateResult.changed,
      previousScore: updateResult.previousScore,
      previousCategorie: updateResult.previousCategorie,
    });

    const scoring = { updateScore } as unknown as ConstructorParameters<typeof ContactScoringWorker>[0];
    const segmentation = { refreshFor: vi.fn().mockResolvedValue([]) } as unknown as ConstructorParameters<typeof ContactScoringWorker>[1];
    const tenantCtx = { getAgenceId: () => '11111111-1111-1111-1111-111111111111' } as unknown as ConstructorParameters<typeof ContactScoringWorker>[3];
    const eventBus = { emitInTx } as unknown as ConstructorParameters<typeof ContactScoringWorker>[2];

    const worker = new ContactScoringWorker(scoring, segmentation, eventBus, tenantCtx);
    return { worker, emitInTx, updateScore };
  }

  it("n'émet PAS d'event si delta < 5 et même catégorie", async () => {
    const { worker, emitInTx } = makeWorker({
      changed: false,
      previousScore: 45,
      previousCategorie: 'tiede',
      score: 47,
      category: 'tiede',
    });
    await worker.rescore('cid', 'aid', 'cause');
    expect(emitInTx).not.toHaveBeenCalled();
  });

  it('émet un event si delta ≥ 5', async () => {
    const { worker, emitInTx } = makeWorker({
      changed: true,
      previousScore: 30,
      previousCategorie: 'froid',
      score: 38,
      category: 'froid',
    });
    await worker.rescore('cid', 'aid', null);
    expect(emitInTx).toHaveBeenCalledTimes(1);
    const event = emitInTx.mock.calls[0]![0] as { type: string; payload: Record<string, unknown> };
    expect(event.type).toBe('contact.score_changed');
    expect(event.payload['score_before']).toBe(30);
    expect(event.payload['score_after']).toBe(38);
  });

  it('émet un event si la catégorie change même avec delta < 5', async () => {
    const { worker, emitInTx } = makeWorker({
      changed: true,
      previousScore: 39,
      previousCategorie: 'froid',
      score: 41,
      category: 'tiede',
    });
    await worker.rescore('cid', null, null);
    expect(emitInTx).toHaveBeenCalledTimes(1);
  });

  it("n'émet PAS d'event si updateScore signale changed=false", async () => {
    const { worker, emitInTx } = makeWorker({
      changed: false,
      previousScore: 60,
      previousCategorie: 'tiede',
      score: 60,
      category: 'tiede',
    });
    await worker.rescore('cid', null, null);
    expect(emitInTx).not.toHaveBeenCalled();
  });
});
