import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IAiProvider, AiTask } from './provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import { FakeAiProvider } from './fake.provider';

export interface RouteResult {
  primary: IAiProvider;
  fallback: IAiProvider | null;
}

/**
 * Choisit le provider selon la tâche, la disponibilité et le mode env.
 * Ordre par défaut : Gemini → OpenAI (coût minimal).
 * En mode fake (AI_PROVIDER_MODE=fake), toujours FakeAiProvider sans fallback.
 */
@Injectable()
export class AiRouter {
  private readonly logger = new Logger(AiRouter.name);

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAiProvider,
    private readonly fake: FakeAiProvider,
    private readonly config: ConfigService,
  ) {}

  route(_task: AiTask): RouteResult {
    const mode = this.config.get<string>('AI_PROVIDER_MODE', 'auto');

    if (mode === 'fake') {
      return { primary: this.fake, fallback: null };
    }
    if (mode === 'openai') {
      return { primary: this.openai, fallback: null };
    }
    if (mode === 'gemini') {
      return { primary: this.gemini, fallback: this.openai };
    }

    // Auto : Gemini si clé dispo, sinon OpenAI
    if (this.config.get<string>('GEMINI_API_KEY')) {
      return { primary: this.gemini, fallback: this.openai };
    }
    if (this.config.get<string>('OPENAI_API_KEY')) {
      return { primary: this.openai, fallback: null };
    }

    this.logger.warn('Aucune clé IA configurée — repli sur fake provider');
    return { primary: this.fake, fallback: null };
  }
}
