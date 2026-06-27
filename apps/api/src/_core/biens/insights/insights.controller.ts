import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser, type JwtPayload } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { BiensInsightsService } from './biens-insights.service';

@Controller('insights')
export class InsightsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly biensInsights: BiensInsightsService,
  ) {}

  @Get()
  @RequirePermissions('biens:read')
  async list(
    @Query('module') module?: string,
    @Query('severity') severity?: string,
    @Query('cible_type') cible_type?: string,
    @Query('cible_id') cible_id?: string,
    @Query('dismissed') dismissed?: string,
    @Query('limit') limit?: string,
  ) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const wantDismissed = dismissed === 'true' || dismissed === '1';
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);

    return this.prisma.insight.findMany({
      where: {
        agence_id,
        ...(module ? { module } : {}),
        ...(severity ? { severity } : {}),
        ...(cible_type ? { cible_type } : {}),
        ...(cible_id ? { cible_id } : {}),
        ...(wantDismissed ? { dismissed_at: { not: null } } : { dismissed_at: null }),
      },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
      take,
    });
  }

  @Post(':id/dismiss')
  @RequirePermissions('biens:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: JwtPayload,
  ): Promise<void> {
    await this.markInsight(id, 'dismissed_at');
  }

  @Post(':id/acted-on')
  @RequirePermissions('biens:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async actedOn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: JwtPayload,
  ): Promise<void> {
    await this.markInsight(id, 'acted_on_at');
  }

  @Post('biens/analyze')
  @RequirePermissions('biens:write')
  @HttpCode(HttpStatus.OK)
  triggerAnalyze(@Body() _body?: Record<string, unknown>) {
    return this.biensInsights.analyzePortfolio();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async markInsight(id: string, field: 'dismissed_at' | 'acted_on_at'): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const insight = await this.prisma.insight.findUnique({ where: { id } });
    if (!insight) throw new NotFoundException(`Insight ${id} introuvable`);
    if (insight.agence_id !== agence_id) throw new ForbiddenException();
    if (insight[field] !== null) throw new BadRequestException('Insight déjà marqué');
    await this.prisma.insight.update({
      where: { id },
      data: { [field]: new Date() },
    });
  }
}
