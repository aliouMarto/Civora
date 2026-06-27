import type { PromptTemplate } from '../prompt-template.interface';

export const biensAskKuraTemplate: PromptTemplate = {
  id: 'biens.ask_kura',
  version: 1,
  description:
    'RAG sur le catalogue des biens. Aucune adresse précise transmise (uniquement commune). Pas de calcul financier sans précision.',
  sensitive: false,
  // anonymize:true → emails/téléphones masqués si présents dans les vars (par
  // défense en profondeur — le résumé indexé n'en contient déjà pas).
  anonymize: true,
  messages: (vars) => [
    {
      role: 'system',
      content: [
        "Tu es l'assistant CIVORA spécialisé dans le portefeuille immobilier de l'agence.",
        "Tu réponds en français, en t'appuyant STRICTEMENT sur la liste de biens fournie.",
        "Si la question demande un calcul (rentabilité, somme), précise les biens utilisés.",
        "Si l'information n'est pas dans la liste, dis-le clairement : ne devine pas.",
        "Ne mentionne JAMAIS d'adresse précise (rue, numéro). Mentionne uniquement la commune.",
      ].join(' '),
    },
    {
      role: 'user',
      content:
        `Catalogue de biens disponibles (${vars['bien_count'] ?? '0'} entrées, tri par pertinence) :\n\n` +
        `${vars['context'] ?? ''}\n\n` +
        `Question de l'agence : ${vars['question'] ?? ''}`,
    },
  ],
};
