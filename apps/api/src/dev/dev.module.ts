import { Module } from '@nestjs/common';

import { EventsModule } from '../_core/events/events.module';
import { JobsModule } from '../_core/jobs/jobs.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { DevController } from './dev.controller';

@Module({
  imports: [EventsModule, JobsModule, PrismaModule],
  controllers: [DevController],
})
export class DevModule {}
