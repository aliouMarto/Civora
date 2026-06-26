import { Global, Module } from '@nestjs/common';

import { TenantContextService } from '../../_core/tenancy/tenant-context.service';
import { PrismaAdminService } from './prisma-admin.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    TenantContextService,
    PrismaService,
    PrismaAdminService,
  ],
  exports: [PrismaService, PrismaAdminService],
})
export class PrismaModule {}
