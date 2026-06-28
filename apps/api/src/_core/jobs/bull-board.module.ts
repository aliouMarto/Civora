import { Module, MiddlewareConsumer, NestModule, type RequestHandler } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { QueueManagerService } from './queue-manager.service';
import { JobsModule } from './jobs.module';

/**
 * Bull Board — UI de monitoring BullMQ sous /admin/queues.
 * Disponible uniquement hors production.
 * L'accès est protégé par JwtAuthGuard + RolesGuard (rôle Admin) au niveau du module.
 */
@Module({ imports: [JobsModule] })
export class BullBoardModule implements NestModule {
  constructor(private readonly queueManager: QueueManagerService) {}

  configure(consumer: MiddlewareConsumer): void {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: this.queueManager.getAll().map((q) => new BullMQAdapter(q)),
      serverAdapter,
    });

    consumer
      .apply(serverAdapter.getRouter() as RequestHandler)
      .forRoutes('/admin/queues');
  }
}
