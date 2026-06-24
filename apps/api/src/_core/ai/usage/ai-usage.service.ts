import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AiTask, AiProviderName } from '../providers/provider.interface';

export interface RecordCallParams {
  agence_id: string;
  module: string;
  task: AiTask;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
  status: 'ok' | 'error' | 'timeout' | 'blocked_by_budget';
  promptText?: string;
  keepFullPrompt?: boolean;
  error?: string;
  correlationId?: string;
}

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordCallParams): Promise<void> {
    const promptHash = params.promptText
      ? createHash('sha256').update(params.promptText).digest('hex').slice(0, 16)
      : undefined;

    await this.prisma.aiCall.create({
      data: {
        agence_id: params.agence_id,
        module: params.module,
        task: params.task,
        provider: params.provider,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        cost_cents: params.costCents,
        latency_ms: params.latencyMs,
        status: params.status,
        prompt_hash: promptHash ?? null,
        error: params.error ?? null,
        correlation_id: params.correlationId ?? null,
      },
    });
  }
}
