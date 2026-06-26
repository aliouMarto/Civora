import { Module } from '@nestjs/common';

import { AiModule } from '../../ai/ai.module';
import { EventsModule } from '../../events/events.module';

import { ContactsIndexerService } from './contacts-indexer.service';

@Module({
  imports: [AiModule, EventsModule],
  providers: [ContactsIndexerService],
  exports: [ContactsIndexerService],
})
export class ContactsIndexerModule {}
