import type { PromptTemplate } from '../prompt-template.interface';

/**
 * Template Ask KURA Contacts (RAG).
 *
 * - sensitive: false   → consultable sans accord explicite (les data sont anonymisées)
 * - anonymize: true    → masque emails/téléphones avant envoi au LLM (défense en profondeur,
 *                        même si on n'envoie déjà PAS de PII dans le résumé indexé)
 *
 * Le prompt impose :
 *   - réponse exclusivement basée sur le contexte fourni
 *   - mention explicite si l'information est insuffisante
 *   - jamais de divulgation d'informations personnelles
 *   - réponse en français
 */
export const contactsAskKuraTemplate: PromptTemplate = {
  id: 'contacts.ask_kura',
  version: 1,
  description: 'Assistant Ask KURA sur la base contacts (RAG).',
  sensitive: false,
  anonymize: true,
  messages: (vars) => [
    {
      role: 'system',
      content:
        "Tu es KURA, un assistant IA pour les agences immobilières en Côte d'Ivoire. " +
        "Tu réponds STRICTEMENT à partir des informations fournies dans le contexte. " +
        "Si l'information n'est pas disponible, dis-le clairement plutôt que d'inventer. " +
        "Ne divulgue JAMAIS d'email ou de téléphone, même si tu en as connaissance. " +
        "Reste concis, factuel et en français. " +
        "Ne propose aucune action automatique : tu informes, tu ne tranches pas.",
    },
    {
      role: 'user',
      content:
        `Question de l'agence : ${vars['question']}\n\n` +
        `Contexte (extraits anonymisés de ${vars['contact_count']} contact(s) trouvés) :\n` +
        `${vars['context']}\n\n` +
        `Réponds à la question en t'appuyant uniquement sur ce contexte. ` +
        `Si la question demande d'identifier des contacts, liste-les par nom et précise les critères qui matchent.`,
    },
  ],
};
