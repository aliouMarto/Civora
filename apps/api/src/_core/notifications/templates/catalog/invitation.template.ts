import type { NotificationTemplate } from '../template.service';

export const invitationTemplate: NotificationTemplate = {
  key: 'invitation',
  channels: ['email', 'in-app'],
  variants: {
    fr: {
      subject: 'Invitation à rejoindre {{nom_agence}}',
      body: `Bonjour {{nom}},\n\nVous êtes invité(e) à rejoindre l'agence {{nom_agence}} sur Civora.\n\nCliquez ici pour accepter : {{lien}}\n\nCe lien expire le {{expiry}}.`,
      html: `<p>Bonjour <strong>{{nom}}</strong>,</p><p>Vous êtes invité(e) à rejoindre l'agence <strong>{{nom_agence}}</strong> sur Civora.</p><p><a href="{{lien}}">Accepter l'invitation</a></p><p>Ce lien expire le {{expiry}}.</p>`,
    },
    en: {
      subject: 'Invitation to join {{nom_agence}}',
      body: `Hello {{nom}},\n\nYou have been invited to join {{nom_agence}} on Civora.\n\nClick here to accept: {{lien}}\n\nThis link expires on {{expiry}}.`,
      html: `<p>Hello <strong>{{nom}}</strong>,</p><p>You have been invited to join <strong>{{nom_agence}}</strong> on Civora.</p><p><a href="{{lien}}">Accept invitation</a></p><p>This link expires on {{expiry}}.</p>`,
    },
  },
};
