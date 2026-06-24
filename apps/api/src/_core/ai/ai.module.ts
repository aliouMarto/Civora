import { Module } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { FakeAiProvider } from './providers/fake.provider';
import { AiRouter } from './providers/router';
import { PromptCatalogService } from './prompt-templates/prompt-catalog.service';
import { BudgetService } from './usage/budget.service';
import { AiUsageService } from './usage/ai-usage.service';
import { EmbeddingsService } from './rag/embeddings.service';
import { RetrievalService } from './rag/retrieval.service';

@Module({
  providers: [
    AiGatewayService,
    OpenAiProvider,
    GeminiProvider,
    FakeAiProvider,
    AiRouter,
    PromptCatalogService,
    BudgetService,
    AiUsageService,
    EmbeddingsService,
    RetrievalService,
  ],
  exports: [AiGatewayService, EmbeddingsService, RetrievalService],
})
export class AiModule {}
