import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { WorkflowRegistryService } from './workflow-registry.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { RunContext } from './workflow-engine.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly registry: WorkflowRegistryService,
    private readonly engine: WorkflowEngineService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('workflows:read')
  async list() {
    const agence_id = this.tenantCtx.requireAgenceId();
    return this.prisma.workflow.findMany({
      where: { agence_id },
      orderBy: { updated_at: 'desc' },
      select: { id: true, code: true, nom: true, type: true, statut: true, version: true, updated_at: true },
    });
  }

  @Patch(':id/toggle')
  @RequirePermissions('workflows:write')
  async toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { statut: 'actif' | 'inactif' },
    @CurrentUser() user: JwtPayload,
  ) {
    const agence_id = this.tenantCtx.requireAgenceId();
    // findFirstOrThrow + agence_id explicite : défense en profondeur en plus
    // de la RLS, évite tout IDOR si la session DB est mal isolée.
    const before = await this.prisma.workflow.findFirstOrThrow({
      where: { id, agence_id },
    });
    const result = await this.registry.toggleStatut(id, body.statut);
    await this.audit.log({
      action: 'workflows:toggle',
      actorId: user.sub,
      entityType: 'Workflow',
      entityId: id,
      before: { statut: before.statut, version: before.version },
      after: { statut: result.statut, version: result.version },
    });
    return result;
  }

  @Patch(':id/params')
  @RequirePermissions('workflows:write')
  async updateParams(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { params: Record<string, unknown> },
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.registry.updateParams(id, body.params);
    await this.audit.log({
      action: 'workflows:update-params',
      actorId: user.sub,
      entityType: 'Workflow',
      entityId: id,
      after: { params: body.params, version: result.version },
    });
    return result;
  }

  @Get(':id/runs')
  @RequirePermissions('workflows:read')
  async runs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const [items, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where: { agence_id, workflow_id: id },
        orderBy: { started_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, status: true, dry_run: true, started_at: true, finished_at: true, error: true },
      }),
      this.prisma.workflowRun.count({ where: { agence_id, workflow_id: id } }),
    ]);
    return { items, total, page, limit };
  }

  @Post(':id/test')
  @RequirePermissions('workflows:write')
  @HttpCode(HttpStatus.OK)
  async dryRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { context?: Record<string, unknown> },
  ) {
    const wf = await this.registry.getById(id);
    const context: RunContext = { workflow_id: id, ...(body.context ?? {}) };
    return this.engine.executeWorkflow(wf, context, /* dryRun */ true);
  }
}
