import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseWorkerService } from '../jobs/base-worker.service';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { NotificationsService, type NotificationJobPayload } from './notifications.service';
import type { Job } from 'bullmq';

@Injectable()
export class NotificationsWorker extends BaseWorkerService<any> {
  protected readonly queueName = 'messaging' as any;

  constructor(
    config: ConfigService,
    deadLetter: DeadLetterService,
    tenantCtx: TenantContextService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(config as any, tenantCtx, deadLetter);
  }

  // @ts-expect-error TEMP: signature divergente avec BaseWorkerService.process
  protected async process(job: Job<NotificationJobPayload>): Promise<void> {
    await this.notificationsService.processJob(job.data);
  }
}
