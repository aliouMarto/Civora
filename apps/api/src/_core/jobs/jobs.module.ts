import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BaseWorkerService } from './base-worker.service';
import { DeadLetterService } from './dead-letter.service';
import { QueueManagerService } from './queue-manager.service';
import { DemoWorker } from './workers/demo.worker';

@Module({
  imports: [PrismaModule, TenancyModule],
  providers: [
    DeadLetterService,
    QueueManagerService,
    DemoWorker,
  ],
  exports: [QueueManagerService, DeadLetterService],
})
export class JobsModule {}
