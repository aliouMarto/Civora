import { Module } from '@nestjs/common';

import { EventsModule } from '../../events/events.module';

import { ContactScoringService } from './contact-scoring.service';
import { SegmentationService } from './segmentation.service';
import { ContactScoringWorker } from './scoring.worker';
import { ScoringScheduler } from './scoring.scheduler';
import { ScoringController } from './scoring.controller';

@Module({
  imports: [EventsModule],
  controllers: [ScoringController],
  providers: [
    ContactScoringService,
    SegmentationService,
    ContactScoringWorker,
    ScoringScheduler,
  ],
  exports: [ContactScoringService, SegmentationService, ContactScoringWorker],
})
export class ContactScoringModule {}
