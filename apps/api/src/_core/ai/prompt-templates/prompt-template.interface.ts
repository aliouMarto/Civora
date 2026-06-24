import type { ChatMessage } from '../providers/provider.interface';

export interface PromptTemplate {
  id: string;
  version: number;
  description: string;
  /** Si true, refus d'envoi sans accord explicite (données financières, PII sensibles). */
  sensitive: boolean;
  /** Si true, masque emails/téléphones dans les vars avant envoi au LLM. */
  anonymize: boolean;
  messages: (vars: Record<string, string>) => ChatMessage[];
}
