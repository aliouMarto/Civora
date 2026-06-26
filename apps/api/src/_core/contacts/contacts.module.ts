import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';

import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsDedupService } from './contacts-dedup.service';
import { InteractionsService } from './interactions.service';
import { SegmentsService } from './segments.service';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactsRepository,
    ContactsDedupService,
    InteractionsService,
    SegmentsService,
  ],
  exports: [
    ContactsService,
    ContactsRepository,
    ContactsDedupService,
    InteractionsService,
    SegmentsService,
  ],
})
export class ContactsModule {}
