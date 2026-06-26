import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';

import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsDedupService } from './contacts-dedup.service';
import { InteractionsService } from './interactions.service';
import { SegmentsService } from './segments.service';

import { ContactScoringModule } from './scoring/scoring.module';
import { AskKuraModule } from './ask-kura/ask-kura.module';
import { ContactsIndexerModule } from './indexing/contacts-indexer.module';
import { ContactsImportExportModule } from './import-export/import-export.module';

@Module({
  imports: [
    AuditModule,
    EventsModule,
    ContactScoringModule,
    AskKuraModule,
    ContactsIndexerModule,
    ContactsImportExportModule,
  ],
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
    ContactScoringModule,
    AskKuraModule,
    ContactsIndexerModule,
    ContactsImportExportModule,
  ],
})
export class ContactsModule {}
