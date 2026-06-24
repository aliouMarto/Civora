export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'in-app';

export interface RenderedNotification {
  subject?: string;
  body: string;
  html?: string;
}

export interface SendResult {
  externalId?: string;
}

export interface INotificationChannel {
  readonly channel: NotificationChannel;
  send(params: {
    to: string;
    rendered: RenderedNotification;
    notificationId: string;
  }): Promise<SendResult>;
}
