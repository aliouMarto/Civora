import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { EventBusService } from './event-bus.service';
import { EventContextService } from './event-context.service';
import { EventHandlerDiscovery } from './event-handler-discovery';
import { EventHandlerRegistry } from './event-handler-registry';
import { IdempotentHandlerService } from './idempotent-handler.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [DiscoveryModule, PrismaModule, TenancyModule],
  providers: [
    EventContextService,
    OutboxService,
    EventBusService,
    EventHandlerRegistry,
    EventHandlerDiscovery,
    IdempotentHandlerService,
    OutboxDispatcherService,
  ],
  exports: [EventBusService, OutboxService, EventContextService, IdempotentHandlerService],
})
export class EventsModule {}
