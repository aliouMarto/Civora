import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PromptCatalogService } from './prompt-templates/prompt-catalog.service';
import { AiRouter } from './providers/router';
import { BudgetService, BudgetExceededError } from './usage/budget.service';
import { AiUsageService } from './usage/ai-usage.service';
import { computeCostCents } from './providers/provider.interface';
import type { ChatOptions } from './providers/provider.interface';

export interface ChatRequest {
  /** Identifiant du template dans le catalogue */
  template: string;
  vars: Record<string, string>;
  options?: ChatOptions;
  /** Module appelant — pour l'audit */
  module: string;
  correlationId?: string;
  /** Si true, autorise les templates sensitive:true */
  allowSensitive?: boolean;
}

export interface ChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  costCents: number;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface EmbedRequest {
  text: string;
  module: string;
  correlationId?: string;
}

export interface EmbedResponse {
  vector: number[];
  inputTokens: number;
  model: string;
  provider: string;
}

// Masque les patterns PII avant envoi au LLM
function anonymizeVars(vars: Record<string, string>): Record<string, string> {
  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  const PHONE_RE = /\+?[0-9]{8,15}/g;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = v.replace(EMAIL_RE, '<email>').replace(PHONE_RE, '<phone>');
  }
  return out;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly tenantCtx: TenantContextService,
    private readonly catalog: PromptCatalogService,
    private readonly router: AiRouter,
    private readonly budget: BudgetService,
    private readonly usage: AiUsageService,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const tpl = this.catalog.get(req.template); // throws NotFoundException si absent

    if (tpl.sensitive && !req.allowSensitive) {
      throw new ForbiddenException(
        `Le template "${req.template}" est marqué sensitive. Passer allowSensitive:true pour confirmer l'accord.`,
      );
    }

    const vars = tpl.anonymize ? anonymizeVars(req.vars) : req.vars;
    const messages = tpl.messages(vars);
    const promptText = messages.map((m) => m.content).join('\n');

    // Estimation budget (approx : 1 token ≈ 4 chars)
    const estimatedInputTokens = Math.ceil(promptText.length / 4);

    await this.checkBudget(agence_id, estimatedInputTokens, req);

    const { primary, fallback } = this.router.route('chat');
    const start = Date.now();

    try {
      const result = await primary.chat(messages, {
        timeoutMs: req.options?.timeoutMs ?? 30_000,
        ...req.options,
      });

      const costCents = computeCostCents(primary, result.inputTokens, result.outputTokens);
      const latencyMs = Date.now() - start;

      await Promise.all([
        this.usage.record({
          agence_id,
          module: req.module,
          task: 'chat',
          provider: primary.name,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costCents,
          latencyMs,
          status: 'ok',
          promptText,
          correlationId: req.correlationId,
        }),
        this.budget.record(agence_id, costCents),
      ]);

      return {
        content: result.content,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        costCents,
        provider: primary.name,
        model: result.model,
        latencyMs,
      };
    } catch (err) {
      // Tentative sur le provider de secours
      if (fallback && isRetryable(err)) {
        this.logger.warn(
          `provider ${primary.name} failed (${(err as Error).message}), trying fallback ${fallback.name}`,
        );

        const result = await fallback.chat(messages, req.options);
        const costCents = computeCostCents(fallback, result.inputTokens, result.outputTokens);
        const latencyMs = Date.now() - start;

        await Promise.all([
          this.usage.record({
            agence_id,
            module: req.module,
            task: 'chat',
            provider: fallback.name,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCents,
            latencyMs,
            status: 'ok',
            promptText,
            correlationId: req.correlationId,
          }),
          this.budget.record(agence_id, costCents),
        ]);

        return {
          content: result.content,
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
          costCents,
          provider: fallback.name,
          model: result.model,
          latencyMs,
        };
      }

      // Enregistrer l'échec
      const status = isTimeout(err) ? 'timeout' : 'error';
      await this.usage.record({
        agence_id,
        module: req.module,
        task: 'chat',
        provider: primary.name,
        model: primary.defaultChatModel,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        latencyMs: Date.now() - start,
        status,
        error: (err as Error).message,
        correlationId: req.correlationId,
      });
      throw err;
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const { primary } = this.router.route('embed');

    const result = await primary.embed(req.text);
    const costCents = computeCostCents(primary, result.inputTokens, 0);

    await Promise.all([
      this.usage.record({
        agence_id,
        module: req.module,
        task: 'embed',
        provider: primary.name,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: 0,
        costCents,
        latencyMs: 0,
        status: 'ok',
        correlationId: req.correlationId,
      }),
      costCents > 0 ? this.budget.record(agence_id, costCents) : Promise.resolve(),
    ]);

    return { vector: result.vector, inputTokens: result.inputTokens, model: result.model, provider: primary.name };
  }

  private async checkBudget(
    agence_id: string,
    estimatedInputTokens: number,
    req: ChatRequest,
  ): Promise<void> {
    try {
      await this.budget.check(agence_id, estimatedInputTokens);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await this.usage.record({
          agence_id,
          module: req.module,
          task: 'chat',
          provider: 'unknown',
          model: 'unknown',
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          latencyMs: 0,
          status: 'blocked_by_budget',
          error: err.message,
          correlationId: req.correlationId,
        });
        throw err;
      }
      throw err;
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded')
  );
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('timeout');
}
