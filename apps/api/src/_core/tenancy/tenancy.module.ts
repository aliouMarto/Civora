import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';
import { TenantMiddleware } from './tenant.middleware';

@Global()
@Module({
  providers: [TenantContextService, TenantGuard],
  exports: [TenantContextService, TenantGuard],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
