import { Module } from '@nestjs/common';

import { EventsModule } from '../../events/events.module';
import { JobsModule } from '../../jobs/jobs.module';

import { BiensRepository } from '../repositories/biens.repository';
import { BiensScoringService } from './biens-scoring.service';
import { BiensScoringWorker } from './biens-scoring.worker';
import { BiensScoringHandler } from './biens-scoring.handler';
import { BiensScoringController } from './scoring.controller';

@Module({
  imports: [EventsModule, JobsModule],
  controllers: [BiensScoringController],
  providers: [
    BiensRepository,
    BiensScoringService,
    BiensScoringWorker,
    BiensScoringHandler,
  ],
  exports: [BiensScoringService],
})
export class BiensScoringModule {}
