import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import type { SendNotificationActionConfig, ActionResult } from './action.interface';
import { resolveTemplate } from '../workflow-template.util';

@Injectable()
export class SendNotificationAction {
  private readonly logger = new Logger(SendNotificationAction.name);

  constructor(private readonly notifications: NotificationsService) {}

  async execute(
    config: SendNotificationActionConfig,
    context: Record<string, unknown>,
    dryRun = false,
  ): Promise<ActionResult> {
    const vars = resolveVars(config.vars, context);
    const to = resolveAddress(config, context);

    if (!to) {
      return { kind: 'send-notification', status: 'failed', error: 'Adresse de destination introuvable' };
    }

    if (dryRun) {
      return { kind: 'send-notification', status: 'skipped', output: { dry_run: true, to, vars } };
    }

    try {
      const result = await this.notifications.send({
        to,
        channel: config.channel,
        template: config.template,
        vars,
      });
      return { kind: 'send-notification', status: 'success', output: result };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`send-notification action failed: ${msg}`);
      return { kind: 'send-notification', status: 'failed', error: msg };
    }
  }
}

function resolveVars(
  vars: Record<string, string>,
  ctx: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = resolveTemplate(v, ctx);
  }
  return out;
}

function resolveAddress(
  config: SendNotificationActionConfig,
  ctx: Record<string, unknown>,
): Parameters<NotificationsService['send']>[0]['to'] | null {
  const field = config.to_field;
  if (!field) return null;

  const val = getNestedValue(ctx, field) as string | undefined;
  if (!val) return null;

  if (config.channel === 'email') return { email: val };
  if (config.channel === 'sms' || config.channel === 'whatsapp') return { phone: val };
  if (config.channel === 'in-app') return { userId: val };
  return null;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
