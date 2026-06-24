import { Injectable, Logger } from '@nestjs/common';
import type { INotificationChannel, RenderedNotification, SendResult } from './channel.interface';

/** Stub WhatsApp — logs uniquement. L'implémentation BSP viendra dans R2. */
@Injectable()
export class WhatsappChannel implements INotificationChannel {
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger(WhatsappChannel.name);

  async send(params: {
    to: string;
    rendered: RenderedNotification;
    notificationId: string;
  }): Promise<SendResult> {
    this.logger.log(`[WHATSAPP-STUB] → ${params.to} | id=${params.notificationId}`);
    return {};
  }
}
