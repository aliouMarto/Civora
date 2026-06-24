import { Global, Module } from '@nestjs/common';

import { TenantContextService } from '../../_core/tenancy/tenant-context.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    TenantContextService,
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
