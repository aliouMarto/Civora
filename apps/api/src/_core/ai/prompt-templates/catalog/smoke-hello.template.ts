import type { PromptTemplate } from '../prompt-template.interface';

export const smokeHelloTemplate: PromptTemplate = {
  id: 'smoke.hello',
  version: 1,
  description: 'Template de smoke test — répond bonjour avec le nom fourni.',
  sensitive: false,
  anonymize: false,
  messages: (vars) => [
    { role: 'system', content: 'Tu es un assistant Civora. Réponds de façon concise.' },
    { role: 'user', content: `Dis bonjour à ${vars['name'] ?? 'l\'utilisateur'}.` },
  ],
};
