import { Injectable, Logger } from '@nestjs/common';
import type { INotificationChannel, RenderedNotification, SendResult } from './channel.interface';

/**
 * Canal In-App : la persistance est gérée par NotificationsService.
 * Ici on prépare l'émission WebSocket — le branchement réel viendra à l'étape 11.
 */
@Injectable()
export class InAppChannel implements INotificationChannel {
  readonly channel = 'in-app' as const;
  private readonly logger = new Logger(InAppChannel.name);

  async send(params: {
    to: string;
    rendered: RenderedNotification;
    notificationId: string;
    userId?: string;
  }): Promise<SendResult> {
    if (params.userId) {
      // Étape 11 : this.gateway.emit(`user.${params.userId}`, { notificationId: params.notificationId });
      this.logger.debug(`[IN-APP] WS event pending user.${params.userId} (ws wired at step 11)`);
    }
    return {};
  }
}
