import { Module } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowRegistryService } from './workflow-registry.service';
import { WorkflowsController } from './workflows.controller';
import { SendNotificationAction } from './actions/send-notification.action';
import { EmitEventAction } from './actions/emit-event.action';
import { CallAiAction } from './actions/call-ai.action';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [NotificationsModule, EventsModule, AiModule],
  providers: [
    WorkflowEngineService,
    WorkflowRegistryService,
    SendNotificationAction,
    EmitEventAction,
    CallAiAction,
  ],
  controllers: [WorkflowsController],
  exports: [WorkflowEngineService, WorkflowRegistryService],
})
export class WorkflowsModule {}
