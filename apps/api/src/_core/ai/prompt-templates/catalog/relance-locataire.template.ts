import type { PromptTemplate } from '../prompt-template.interface';

export const relanceLocataireTemplate: PromptTemplate = {
  id: 'relance.locataire',
  version: 1,
  description: 'Génère un email de relance de loyer impayé.',
  sensitive: true,   // contient des infos financières — nécessite accord explicite
  anonymize: true,   // masque emails/téléphones avant envoi au LLM
  messages: (vars) => [
    {
      role: 'system',
      content:
        'Tu es un assistant juridique immobilier en Côte d\'Ivoire. ' +
        'Rédige un email de relance professionnel et courtois en français.',
    },
    {
      role: 'user',
      content:
        `Rédige un email de relance pour un loyer impayé.\n` +
        `Locataire : ${vars['nom_locataire']}\n` +
        `Montant dû : ${vars['montant']} FCFA\n` +
        `Échéance dépassée de : ${vars['jours_retard']} jours\n` +
        `Bien : ${vars['adresse_bien']}`,
    },
  ],
};
