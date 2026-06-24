import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetService, BudgetExceededError } from '../usage/budget.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

function makeService(overrides: {
  used_cents?: number;
  monthly_limit_cents?: number;
  current_month?: string;
} = {}) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const mockBudget = {
    used_cents: overrides.used_cents ?? 0,
    monthly_limit_cents: overrides.monthly_limit_cents ?? 1000,
    current_month: overrides.current_month ?? month,
  };

  const mockPrisma = {
    aiBudget: {
      upsert: vi.fn().mockResolvedValue(mockBudget),
      update: vi.fn().mockResolvedValue(mockBudget),
    },
  } as unknown as PrismaService;

  const svc = new BudgetService(mockPrisma);
  return { svc, mockPrisma, mockBudget };
}

describe('BudgetService', () => {
  it('ne lève rien si le budget est disponible', async () => {
    const { svc } = makeService({ used_cents: 200, monthly_limit_cents: 1000 });
    await expect(svc.check('agence-abc', 100)).resolves.toBeUndefined();
  });

  it('lève BudgetExceededError si le plafond est atteint', async () => {
    const { svc } = makeService({ used_cents: 950, monthly_limit_cents: 1000 });
    await expect(svc.check('agence-abc', 100)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('BudgetExceededError contient used et limit', async () => {
    const { svc } = makeService({ used_cents: 1000, monthly_limit_cents: 1000 });

    try {
      await svc.check('agence-abc', 1);
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      expect((err as BudgetExceededError).usedCents).toBe(1000);
      expect((err as BudgetExceededError).limitCents).toBe(1000);
    }
  });

  it('record() incrémente le compteur', async () => {
    const { svc, mockPrisma } = makeService();

    await svc.record('agence-abc', 50);

    expect(mockPrisma.aiBudget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { used_cents: { increment: 50 } },
      }),
    );
  });

  it('nouveau mois → remise à zéro du compteur', async () => {
    const { svc, mockPrisma } = makeService({ current_month: '2025-01', used_cents: 999 });

    // Le mois actuel est différent de celui en base → reset
    await svc.check('agence-abc', 1);

    expect(mockPrisma.aiBudget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ used_cents: 0 }),
      }),
    );
  });
});
