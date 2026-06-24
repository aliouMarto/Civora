import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationChannel } from '../channels/channel.interface';
import { invitationTemplate } from './catalog/invitation.template';
import { loginAlertTemplate } from './catalog/login-alert.template';
import type { RenderedNotification } from '../channels/channel.interface';

export type SupportedLanguage = 'fr' | 'en';

export interface TemplateVariant {
  subject?: string;
  body: string;
  html?: string;
}

export interface NotificationTemplate {
  key: string;
  channels: NotificationChannel[];
  variants: Partial<Record<SupportedLanguage, TemplateVariant>>;
}

const CATALOG: Map<string, NotificationTemplate> = new Map(
  [invitationTemplate, loginAlertTemplate].map((t) => [t.key, t]),
);

@Injectable()
export class TemplateService {
  get(key: string): NotificationTemplate {
    const tpl = CATALOG.get(key);
    if (!tpl) {
      throw new NotFoundException(`Template inconnu : "${key}"`);
    }
    return tpl;
  }

  render(
    key: string,
    vars: Record<string, string>,
    language: SupportedLanguage = 'fr',
  ): RenderedNotification {
    const tpl = this.get(key);
    const variant = tpl.variants[language] ?? tpl.variants['fr'];
    if (!variant) {
      throw new NotFoundException(`Template "${key}" sans variante fr ni ${language}`);
    }

    return {
      subject: variant.subject ? interpolate(variant.subject, vars) : undefined,
      body: interpolate(variant.body, vars),
      html: variant.html ? interpolate(variant.html, vars) : undefined,
    };
  }

  supports(key: string, channel: NotificationChannel): boolean {
    const tpl = CATALOG.get(key);
    return tpl?.channels.includes(channel) ?? false;
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
