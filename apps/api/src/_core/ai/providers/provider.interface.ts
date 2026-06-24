export type AiTask = 'chat' | 'embed' | 'classify';
export type AiProviderName = 'openai' | 'gemini' | 'fake';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface EmbedResult {
  vector: number[];
  inputTokens: number;
  model: string;
}

export interface IAiProvider {
  readonly name: AiProviderName;
  readonly defaultChatModel: string;
  readonly defaultEmbedModel: string;
  /** Coût en centimes USD pour 1 000 tokens input */
  readonly inputCostPer1kCents: number;
  /** Coût en centimes USD pour 1 000 tokens output */
  readonly outputCostPer1kCents: number;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  embed(text: string, options?: { timeoutMs?: number }): Promise<EmbedResult>;
}

export function computeCostCents(
  provider: IAiProvider,
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.ceil(
    (inputTokens / 1000) * provider.inputCostPer1kCents +
      (outputTokens / 1000) * provider.outputCostPer1kCents,
  );
}
