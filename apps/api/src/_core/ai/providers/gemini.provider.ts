import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  IAiProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
} from './provider.interface';

@Injectable()
export class GeminiProvider implements IAiProvider {
  readonly name = 'gemini' as const;
  readonly defaultChatModel = 'gemini-1.5-flash';
  readonly defaultEmbedModel = 'text-embedding-004';
  readonly inputCostPer1kCents = 0;   // Gratuit dans les limites du free tier
  readonly outputCostPer1kCents = 0;

  private readonly logger = new Logger(GeminiProvider.name);
  private client!: GoogleGenerativeAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    this.assertClient();
    const modelName = options.model ?? this.defaultChatModel;
    const genModel = this.client.getGenerativeModel({ model: modelName });

    // Sépare le system prompt des messages de conversation
    const systemMsg = messages.find((m) => m.role === 'system');
    const history = messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));
    const lastUser = messages.filter((m) => m.role === 'user').at(-1);

    const chat = genModel.startChat({
      history,
      systemInstruction: systemMsg?.content,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.3,
      },
    });

    const timeoutMs = options.timeoutMs ?? 30_000;
    const result = await Promise.race([
      chat.sendMessage(lastUser?.content ?? ''),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), timeoutMs),
      ),
    ]);

    const text = result.response.text();
    const usage = result.response.usageMetadata;

    return {
      content: text,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      model: modelName,
    };
  }

  async embed(text: string, options: { timeoutMs?: number } = {}): Promise<EmbedResult> {
    this.assertClient();
    const modelName = this.defaultEmbedModel;
    const genModel = this.client.getGenerativeModel({ model: modelName });

    const timeoutMs = options.timeoutMs ?? 30_000;
    const result = await Promise.race([
      genModel.embedContent(text),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini embed timeout')), timeoutMs),
      ),
    ]);

    // Gemini text-embedding-004 : 768 dims → on normalise/pad à 1536 pour uniformité
    const raw = result.embedding.values;
    const vector = padTo1536(raw);

    return { vector, inputTokens: 0, model: modelName };
  }

  private assertClient(): void {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY non configurée');
    }
  }
}

/** Normalise le vecteur Gemini (768 dims) à 1536 par duplication symétrique. */
function padTo1536(v: number[]): number[] {
  if (v.length === 1536) return v;
  if (v.length === 768) return [...v, ...v];
  // Fallback : truncate ou zero-pad
  const out = new Array<number>(1536).fill(0);
  for (let i = 0; i < Math.min(v.length, 1536); i++) out[i] = v[i]!;
  return out;
}
