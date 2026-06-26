import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { EventsModule } from '../../events/events.module';
import { JobsModule } from '../../jobs/jobs.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { StorageModule } from '../../storage/storage.module';

import { ContactsRepository } from '../contacts.repository';
import { ContactsDedupService } from '../contacts-dedup.service';

import { ContactsImportController } from './contacts-import.controller';
import { ContactsImportService } from './contacts-import.service';
import { ContactsExportController } from './contacts-export.controller';
import { ContactsExportService } from './contacts-export.service';
import { ContactsImportWorker } from './workers/import.worker';
import { ContactsExportWorker } from './workers/export.worker';

@Module({
  imports: [
    AuditModule,
    EventsModule,
    JobsModule,
    RealtimeModule,
    StorageModule,
  ],
  controllers: [ContactsImportController, ContactsExportController],
  providers: [
    ContactsImportService,
    ContactsExportService,
    ContactsImportWorker,
    ContactsExportWorker,
    // Re-fournis localement (le ContactsModule les exporte aussi, mais on
    // garde l'autonomie pour éviter une dépendance cyclique).
    ContactsRepository,
    ContactsDedupService,
  ],
  exports: [ContactsImportService, ContactsExportService],
})
export class ContactsImportExportModule {}
