import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { QueueManagerService } from '../jobs/queue-manager.service';
import { TemplateService, type SupportedLanguage } from './templates/template.service';
import type { NotificationChannel } from './channels/channel.interface';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { InAppChannel } from './channels/in-app.channel';
import type { INotificationChannel } from './channels/channel.interface';

export interface SendNotificationDto {
  to: {
    email?: string;
    phone?: string;
    userId?: string;
    contactId?: string;
  };
  channel: NotificationChannel;
  template: string;
  vars: Record<string, string>;
  language?: SupportedLanguage;
  /** Si true et whatsapp échoue, repli sur sms */
  fallbackToSms?: boolean;
}

export interface NotificationJobPayload {
  notificationId: string;
  agence_id: string;
  channel: NotificationChannel;
  to: string;
  template: string;
  vars: Record<string, string>;
  language: SupportedLanguage;
  userId?: string;
  fallbackToSms?: boolean;
}

// Regex E.164 (ex: +22507XXXXXXXX)
const E164_RE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Masque les valeurs contenant email ou téléphone avant de logger */
function sanitizeVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (/email|phone|tel|numero|portable/i.test(k) && v.length > 3) {
      out[k] = createHash('sha256').update(v).digest('hex').slice(0, 8) + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: Map<NotificationChannel, INotificationChannel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly queues: QueueManagerService,
    private readonly templates: TemplateService,
    private readonly emailChannel: EmailChannel,
    private readonly smsChannel: SmsChannel,
    private readonly whatsappChannel: WhatsappChannel,
    private readonly inAppChannel: InAppChannel,
  ) {
    this.channels = new Map([
      ['email', emailChannel],
      ['sms', smsChannel],
      ['whatsapp', whatsappChannel],
      ['in-app', inAppChannel],
    ]);
  }

  /** Valide, persiste (status=queued) et enfile le job BullMQ. */
  async send(dto: SendNotificationDto): Promise<{ notificationId: string }> {
    const agence_id = this.tenantCtx.requireAgenceId();

    // Valider le template existe
    this.templates.get(dto.template);

    // Résoudre l'adresse de destination
    const to = resolveAddress(dto.channel, dto.to);

    // Créer la ligne Notification (queued)
    const notification = await this.prisma.notification.create({
      data: {
        agence_id,
        utilisateur_id: dto.to.userId ?? null,
        contact_id: dto.to.contactId ?? null,
        channel: dto.channel,
        template: dto.template,
        vars: dto.vars,
        status: 'queued',
      },
    });

    // Enfile dans la file messaging
    const queue = this.queues.getQueue('messaging');
    await queue.add('send-notification', {
      notificationId: notification.id,
      agence_id,
      channel: dto.channel,
      to,
      template: dto.template,
      vars: dto.vars,
      language: dto.language ?? 'fr',
      userId: dto.to.userId,
      fallbackToSms: dto.fallbackToSms,
    } satisfies NotificationJobPayload, {
      jobId: `notif-${notification.id}`,
      removeOnComplete: true,
    });

    this.logger.log(
      `notification queued: ${notification.id} (${dto.channel}/${dto.template}) → ${sanitizeAddress(dto.channel, to)}`,
    );
    return { notificationId: notification.id };
  }

  /** Exécuté par le worker messaging. */
  async processJob(payload: NotificationJobPayload): Promise<void> {
    const { notificationId, channel, to, template, vars, language, userId, fallbackToSms } =
      payload;

    const rendered = this.templates.render(template, vars, language);

    try {
      let ch = this.channels.get(channel);
      if (!ch) throw new NotFoundException(`Canal inconnu: ${channel}`);

      let result = await ch.send({ to, rendered, notificationId, ...(userId ? { userId } : {}) });

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'sent',
          sent_at: new Date(),
          external_id: result.externalId ?? null,
        },
      });

      this.logger.log(
        `notification sent: ${notificationId} (${channel}/${template}) | vars=${JSON.stringify(sanitizeVars(vars))}`,
      );
    } catch (err) {
      // Repli whatsapp → sms si configuré
      if (channel === 'whatsapp' && fallbackToSms) {
        this.logger.warn(
          `whatsapp failed for ${notificationId}, falling back to sms`,
        );
        const smsRendered = this.templates.render(template, vars, language);
        await this.smsChannel.send({ to, rendered: smsRendered, notificationId });

        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { status: 'sent', sent_at: new Date(), error: `whatsapp failed, sent via sms` },
        });
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'failed', error: msg },
      });
      throw err;
    }
  }

  /** Liste les notifications in-app de l'utilisateur courant (paginée). */
  async listForUser(params: {
    userId: string;
    page: number;
    limit: number;
  }) {
    const agence_id = this.tenantCtx.requireAgenceId();

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { agence_id, utilisateur_id: params.userId, channel: 'in-app' },
        orderBy: { created_at: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          id: true,
          template: true,
          vars: true,
          status: true,
          created_at: true,
          read_at: true,
        },
      }),
      this.prisma.notification.count({
        where: { agence_id, utilisateur_id: params.userId, channel: 'in-app' },
      }),
    ]);

    return { items, total, page: params.page, limit: params.limit };
  }

  /** Marque une notification in-app comme lue. */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();

    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.agence_id !== agence_id || notif.utilisateur_id !== userId) {
      throw new ForbiddenException('Notification non trouvée ou accès refusé');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'read', read_at: new Date() },
    });
  }
}

function resolveAddress(
  channel: NotificationChannel,
  to: SendNotificationDto['to'],
): string {
  if (channel === 'email') {
    if (!to.email) throw new BadRequestException('email requis pour le canal email');
    if (!EMAIL_RE.test(to.email))
      throw new BadRequestException(`Email invalide : ${to.email}`);
    return to.email;
  }
  if (channel === 'sms' || channel === 'whatsapp') {
    if (!to.phone) throw new BadRequestException(`phone requis pour le canal ${channel}`);
    if (!E164_RE.test(to.phone))
      throw new BadRequestException(`Téléphone E.164 invalide : ${to.phone}`);
    return to.phone;
  }
  if (channel === 'in-app') {
    if (!to.userId && !to.contactId)
      throw new BadRequestException('userId ou contactId requis pour le canal in-app');
    return to.userId ?? to.contactId!;
  }
  throw new BadRequestException(`Canal inconnu : ${channel}`);
}

function sanitizeAddress(channel: NotificationChannel, to: string): string {
  if (channel === 'email') {
    const [local, domain] = to.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (channel === 'sms' || channel === 'whatsapp') {
    return to.slice(0, 4) + '***' + to.slice(-2);
  }
  return to;
}
