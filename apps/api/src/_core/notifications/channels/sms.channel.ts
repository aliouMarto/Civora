import { Injectable, Logger } from '@nestjs/common';
import type { INotificationChannel, RenderedNotification, SendResult } from './channel.interface';

/** Stub SMS — logs uniquement. L'implémentation PSP viendra dans R2 (Mobile Money). */
@Injectable()
export class SmsChannel implements INotificationChannel {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsChannel.name);

  async send(params: {
    to: string;
    rendered: RenderedNotification;
    notificationId: string;
  }): Promise<SendResult> {
    this.logger.log(`[SMS-STUB] → ${params.to} | id=${params.notificationId}`);
    return {};
  }
}
