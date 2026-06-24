import { Injectable } from '@nestjs/common';
import type {
  IAiProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
} from './provider.interface';

/**
 * Provider fictif pour les tests et le mode dev (AI_PROVIDER_MODE=fake).
 * Retourne des réponses déterministes sans appel réseau.
 */
@Injectable()
export class FakeAiProvider implements IAiProvider {
  readonly name = 'fake' as const;
  readonly defaultChatModel = 'fake-chat-v1';
  readonly defaultEmbedModel = 'fake-embed-v1';
  readonly inputCostPer1kCents = 0;
  readonly outputCostPer1kCents = 0;

  async chat(messages: ChatMessage[], _options: ChatOptions = {}): Promise<ChatResult> {
    const lastUser = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    return {
      content: `[FAKE] réponse à : ${lastUser.slice(0, 80)}`,
      inputTokens: Math.ceil(lastUser.length / 4),
      outputTokens: 20,
      model: this.defaultChatModel,
    };
  }

  async embed(text: string): Promise<EmbedResult> {
    // Vecteur déterministe basé sur le hash du texte (pour les tests de retrieval)
    const vector = deterministicVector(text, 1536);
    return { vector, inputTokens: Math.ceil(text.length / 4), model: this.defaultEmbedModel };
  }
}

function deterministicVector(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dims] = (v[i % dims]! + text.charCodeAt(i)) % 256;
  }
  // Normaliser (norme L2)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
