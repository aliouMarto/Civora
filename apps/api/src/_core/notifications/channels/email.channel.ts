import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { INotificationChannel, RenderedNotification, SendResult } from './channel.interface';

@Injectable()
export class EmailChannel implements INotificationChannel, OnModuleInit {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailChannel.name);
  private transporter!: Transporter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
  }

  async send(params: {
    to: string;
    rendered: RenderedNotification;
    notificationId: string;
  }): Promise<SendResult> {
    const { to, rendered, notificationId } = params;

    const info = await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM', 'Civora <no-reply@civora.io>'),
      to,
      subject: rendered.subject ?? '(sans sujet)',
      text: rendered.body,
      html: rendered.html,
      headers: { 'X-Notification-Id': notificationId },
    });

    this.logger.log(`email sent: ${info.messageId} → ${to}`);
    return { externalId: info.messageId };
  }
}
