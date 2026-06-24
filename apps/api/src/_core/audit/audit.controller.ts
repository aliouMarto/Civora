import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { RequirePermissions } from '../rbac/permissions.decorator';

@Controller('admin/audit')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('action') action?: string,
    @Query('entity_type') entityType?: string,
    @Query('actor_id') actorId?: string,
  ) {
    const agence_id = this.tenantCtx.requireAgenceId();

    const where = {
      agence_id,
      ...(action ? { action } : {}),
      ...(entityType ? { entity_type: entityType } : {}),
      ...(actorId ? { actor_id: actorId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          actor_id: true,
          actor_type: true,
          action: true,
          entity_type: true,
          entity_id: true,
          metadata: true,
          occurred_at: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
