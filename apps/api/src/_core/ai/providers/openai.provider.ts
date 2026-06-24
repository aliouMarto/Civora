import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  IAiProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
} from './provider.interface';

@Injectable()
export class OpenAiProvider implements IAiProvider {
  readonly name = 'openai' as const;
  readonly defaultChatModel = 'gpt-4o-mini';
  readonly defaultEmbedModel = 'text-embedding-3-small';
  readonly inputCostPer1kCents = 1;   // ~$0.01 / 1k tokens input (gpt-4o-mini)
  readonly outputCostPer1kCents = 3;  // ~$0.03 / 1k tokens output

  private readonly logger = new Logger(OpenAiProvider.name);
  private client!: OpenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    this.assertClient();
    const model = options.model ?? this.defaultChatModel;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

    try {
      const res = await this.client.chat.completions.create(
        {
          model,
          messages,
          max_tokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.3,
        },
        { signal: controller.signal },
      );

      return {
        content: res.choices[0]?.message?.content ?? '',
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string, options: { timeoutMs?: number } = {}): Promise<EmbedResult> {
    this.assertClient();
    const model = this.defaultEmbedModel;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

    try {
      const res = await this.client.embeddings.create(
        { model, input: text },
        { signal: controller.signal },
      );
      return {
        vector: res.data[0]!.embedding,
        inputTokens: res.usage?.prompt_tokens ?? 0,
        model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private assertClient(): void {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY non configurée');
    }
  }
}
