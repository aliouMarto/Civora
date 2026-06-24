import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiGatewayService } from '../ai-gateway.service';
import { PromptCatalogService } from '../prompt-templates/prompt-catalog.service';
import { FakeAiProvider } from '../providers/fake.provider';
import { BudgetService, BudgetExceededError } from '../usage/budget.service';
import { AiUsageService } from '../usage/ai-usage.service';
import type { TenantContextService } from '../../tenancy/tenant-context.service';
import type { AiRouter } from '../providers/router';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDeps() {
  const fakeProvider = new FakeAiProvider();

  const mockUsage = { record: vi.fn().mockResolvedValue(undefined) };

  const mockBudget = {
    check: vi.fn().mockResolvedValue(undefined),
    record: vi.fn().mockResolvedValue(undefined),
  };

  const mockTenantCtx = {
    requireAgenceId: vi.fn().mockReturnValue('agence-abc'),
  } as unknown as TenantContextService;

  const mockRouter = {
    route: vi.fn().mockReturnValue({ primary: fakeProvider, fallback: null }),
  } as unknown as AiRouter;

  const catalog = new PromptCatalogService();

  const svc = new AiGatewayService(
    mockTenantCtx,
    catalog,
    mockRouter,
    mockBudget as unknown as BudgetService,
    mockUsage as unknown as AiUsageService,
  );

  return { svc, fakeProvider, mockUsage, mockBudget, mockTenantCtx, mockRouter };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiGatewayService.chat()', () => {
  it('retourne le contenu et enregistre l\'usage (fake provider)', async () => {
    const { svc, mockUsage } = makeDeps();

    const res = await svc.chat({
      template: 'smoke.hello',
      vars: { name: 'Sory' },
      module: 'test',
    });

    expect(res.content).toContain('[FAKE]');
    expect(res.provider).toBe('fake');
    expect(mockUsage.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', task: 'chat' }),
    );
  });

  it('enregistre les tokens et le coût', async () => {
    const { svc, mockUsage } = makeDeps();

    await svc.chat({ template: 'smoke.hello', vars: { name: 'Test' }, module: 'test' });

    expect(mockUsage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        costCents: expect.any(Number),
      }),
    );
  });

  it('lève NotFoundException pour un template inexistant', async () => {
    const { svc } = makeDeps();

    await expect(
      svc.chat({ template: 'template.inexistant', vars: {}, module: 'test' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuse un template sensitive sans allowSensitive → ForbiddenException', async () => {
    const { svc } = makeDeps();

    await expect(
      svc.chat({ template: 'relance.locataire', vars: {}, module: 'test' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepte un template sensitive avec allowSensitive:true', async () => {
    const { svc } = makeDeps();

    const res = await svc.chat({
      template: 'relance.locataire',
      vars: { nom_locataire: 'Diallo', montant: '50000', jours_retard: '10', adresse_bien: 'Cocody' },
      module: 'test',
      allowSensitive: true,
    });

    expect(res.content).toBeTruthy();
  });

  it('budget dépassé → status blocked_by_budget + BudgetExceededError remontée', async () => {
    const { svc, mockBudget, mockUsage } = makeDeps();

    mockBudget.check.mockRejectedValue(
      new BudgetExceededError('agence-abc', 1000, 1000),
    );

    await expect(
      svc.chat({ template: 'smoke.hello', vars: { name: 'X' }, module: 'test' }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(mockUsage.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked_by_budget' }),
    );
  });

  it('provider 1 timeout → fallback provider 2', async () => {
    const { svc, fakeProvider, mockRouter } = makeDeps();

    const fallbackProvider = new FakeAiProvider();
    const fallbackSpy = vi.spyOn(fallbackProvider, 'chat');

    const failingPrimary = {
      ...fakeProvider,
      name: 'gemini' as const,
      chat: vi.fn().mockRejectedValue(new Error('Gemini timeout')),
    };

    mockRouter.route = vi.fn().mockReturnValue({
      primary: failingPrimary,
      fallback: fallbackProvider,
    });

    const res = await svc.chat({ template: 'smoke.hello', vars: { name: 'Test' }, module: 'test' });

    expect(fallbackSpy).toHaveBeenCalledOnce();
    expect(res.content).toContain('[FAKE]');
  });

  it('anonymise les PII (email) pour les templates avec anonymize:true', async () => {
    const { svc, mockRouter } = makeDeps();

    const capturedMessages: any[] = [];
    const spyProvider = {
      name: 'fake' as const,
      defaultChatModel: 'fake',
      defaultEmbedModel: 'fake',
      inputCostPer1kCents: 0,
      outputCostPer1kCents: 0,
      chat: vi.fn().mockImplementation(async (msgs: any[]) => {
        capturedMessages.push(...msgs);
        return { content: 'ok', inputTokens: 10, outputTokens: 5, model: 'fake' };
      }),
      embed: vi.fn(),
    };

    mockRouter.route = vi.fn().mockReturnValue({ primary: spyProvider, fallback: null });

    await svc.chat({
      template: 'relance.locataire',
      vars: {
        nom_locataire: 'Diallo diallo@test.com',
        montant: '50000',
        jours_retard: '10',
        adresse_bien: 'Cocody',
      },
      module: 'test',
      allowSensitive: true,
    });

    const allText = capturedMessages.map((m) => m.content).join(' ');
    expect(allText).not.toContain('diallo@test.com');
    expect(allText).toContain('<email>');
  });
});
