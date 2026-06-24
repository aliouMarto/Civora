import type { NotificationTemplate } from '../template.service';

export const loginAlertTemplate: NotificationTemplate = {
  key: 'login-alert',
  channels: ['email', 'in-app'],
  variants: {
    fr: {
      subject: 'Connexion détectée sur votre compte',
      body: `Bonjour {{nom}},\n\nUne connexion a été détectée sur votre compte Civora.\n\nDate : {{date}}\nAppareil : {{appareil}}\nAdresse IP : {{ip}}\n\nSi ce n'est pas vous, changez votre mot de passe immédiatement.`,
      html: `<p>Bonjour <strong>{{nom}}</strong>,</p><p>Une connexion a été détectée sur votre compte Civora.</p><ul><li>Date : {{date}}</li><li>Appareil : {{appareil}}</li><li>IP : {{ip}}</li></ul><p>Si ce n'est pas vous, changez votre mot de passe immédiatement.</p>`,
    },
    en: {
      subject: 'New sign-in detected on your account',
      body: `Hello {{nom}},\n\nA sign-in was detected on your Civora account.\n\nDate: {{date}}\nDevice: {{appareil}}\nIP: {{ip}}\n\nIf this wasn't you, change your password immediately.`,
      html: `<p>Hello <strong>{{nom}}</strong>,</p><p>A sign-in was detected on your Civora account.</p><ul><li>Date: {{date}}</li><li>Device: {{appareil}}</li><li>IP: {{ip}}</li></ul><p>If this wasn't you, change your password immediately.</p>`,
    },
  },
};
