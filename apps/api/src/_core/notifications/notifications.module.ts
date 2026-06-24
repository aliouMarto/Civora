import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWorker } from './notifications.worker';
import { TemplateService } from './templates/template.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { InAppChannel } from './channels/in-app.channel';

@Module({
  providers: [
    NotificationsService,
    NotificationsWorker,
    TemplateService,
    EmailChannel,
    SmsChannel,
    WhatsappChannel,
    InAppChannel,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
