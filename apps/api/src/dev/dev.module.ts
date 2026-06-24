import { Module } from '@nestjs/common';

import { EventsModule } from '../_core/events/events.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { DevController } from './dev.controller';

@Module({
  imports: [EventsModule, PrismaModule],
  controllers: [DevController],
})
export class DevModule {}
