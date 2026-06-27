import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';

import { Audited } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

import { BiensService } from './biens.service';
import { BiensSpatialService } from './biens-spatial.service';
import { BiensStatsService } from './biens-stats.service';
import { BienHistoriqueService } from './bien-historique.service';

import { CreateBienDto } from './dto/create-bien.dto';
import { UpdateBienDto } from './dto/update-bien.dto';
import { ListBiensQueryDto } from './dto/list-biens.query.dto';
import { SearchSpatialDto } from './dto/search-spatial.dto';

@Controller('biens')
@UseInterceptors(AuditInterceptor)
export class BiensController {
  constructor(
    private readonly biens: BiensService,
    private readonly spatial: BiensSpatialService,
    private readonly stats: BiensStatsService,
    private readonly historique: BienHistoriqueService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('biens:read')
  list(@Query() q: ListBiensQueryDto) {
    return this.biens.list(q);
  }

  @Get(':id')
  @RequirePermissions('biens:read')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.biens.getFiche360(id);
  }

  @Post()
  @RequirePermissions('biens:write')
  @Audited('biens:create')
  create(@Body() dto: CreateBienDto, @CurrentUser() user: JwtPayload) {
    return this.biens.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('biens:write')
  @Audited('biens:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBienDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.biens.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('biens:delete')
  @Audited('biens:archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.biens.archive(id, user);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats/repartition')
  @RequirePermissions('biens:read')
  repartition() {
    return this.stats.repartition();
  }

  @Get('stats/portefeuille')
  @RequirePermissions('biens:read')
  portefeuille() {
    return this.stats.portefeuille();
  }

  @Get('communes')
  @RequirePermissions('biens:read')
  communes() {
    return this.spatial.communeStats();
  }

  // ─── Spatial ──────────────────────────────────────────────────────────────

  @Get('map')
  @RequirePermissions('biens:read')
  map(@Query('bbox') bboxParam: string) {
    if (!bboxParam) {
      // 400 explicite : on refuse de servir le parc entier
      throw new Error('Le paramètre `bbox` est obligatoire (minLng,minLat,maxLng,maxLat)');
    }
    const parts = bboxParam.split(',').map((s) => Number(s));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      throw new Error('bbox malformé — format attendu: minLng,minLat,maxLng,maxLat');
    }
    return this.spatial.mapGeoJson(parts as [number, number, number, number]);
  }

  @Post('spatial/search')
  @RequirePermissions('biens:read')
  @HttpCode(HttpStatus.OK)
  spatialSearch(@Body() dto: SearchSpatialDto) {
    return this.spatial.search(dto);
  }

  // ─── Historique ───────────────────────────────────────────────────────────

  @Get(':id/historique')
  @RequirePermissions('biens:read')
  listHistorique(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.historique.list(id, page, Math.min(limit, 100));
  }
}
