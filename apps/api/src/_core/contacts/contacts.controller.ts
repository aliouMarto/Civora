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

import { ContactsService } from './contacts.service';
import { ContactsDedupService } from './contacts-dedup.service';
import { InteractionsService } from './interactions.service';
import { SegmentsService } from './segments.service';

import { CheckDuplicatesDto } from './dto/check-duplicates.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import { MergeContactsDto } from './dto/merge-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller()
@UseInterceptors(AuditInterceptor)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly dedup: ContactsDedupService,
    private readonly interactions: InteractionsService,
    private readonly segments: SegmentsService,
  ) {}

  // ─── Contacts ──────────────────────────────────────────────────────────────

  @Get('contacts')
  @RequirePermissions('contacts:read')
  list(@Query() q: ListContactsQueryDto) {
    return this.contacts.list(q);
  }

  @Get('contacts/:id')
  @RequirePermissions('contacts:read')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.getFiche360(id);
  }

  @Post('contacts')
  @RequirePermissions('contacts:write')
  @Audited('contacts:create')
  create(@Body() dto: CreateContactDto, @CurrentUser() user: JwtPayload) {
    return this.contacts.create(dto, user);
  }

  @Patch('contacts/:id')
  @RequirePermissions('contacts:write')
  @Audited('contacts:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.contacts.update(id, dto, user);
  }

  @Delete('contacts/:id')
  @RequirePermissions('contacts:delete')
  @Audited('contacts:archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.contacts.archive(id, user);
  }

  @Post('contacts/check-duplicates')
  @RequirePermissions('contacts:read')
  @HttpCode(HttpStatus.OK)
  async checkDuplicates(@Body() dto: CheckDuplicatesDto, @CurrentUser() user: JwtPayload) {
    const matches = await this.dedup.check({
      agence_id: user.agence_id,
      email: dto.email,
      telephone: dto.telephone,
      nom: dto.nom,
    });
    return { matches };
  }

  @Post('contacts/merge')
  @RequirePermissions('contacts:write')
  @Audited('contacts:merge')
  @HttpCode(HttpStatus.OK)
  merge(@Body() dto: MergeContactsDto, @CurrentUser() user: JwtPayload) {
    return this.contacts.merge(dto, user);
  }

  // ─── Interactions ──────────────────────────────────────────────────────────

  @Post('contacts/:id/interactions')
  @RequirePermissions('contacts:write')
  @Audited('contacts:interaction')
  async recordInteraction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.interactions.record(id, dto, user);
  }

  @Get('contacts/:id/interactions')
  @RequirePermissions('contacts:read')
  listInteractions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.interactions.listForContact(id, page, Math.min(limit, 100));
  }

  // ─── Segments ──────────────────────────────────────────────────────────────

  @Get('segments')
  @RequirePermissions('contacts:read')
  listSegments() {
    return this.segments.list();
  }

  @Post('segments')
  @RequirePermissions('contacts:write')
  @Audited('segments:create')
  createSegment(@Body() dto: CreateSegmentDto, @CurrentUser() user: JwtPayload) {
    return this.segments.create(dto, user);
  }

  @Get('segments/:id/membres')
  @RequirePermissions('contacts:read')
  listSegmentMembres(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.segments.listMembres(id, page, Math.min(limit, 100));
  }

  @Delete('segments/:id')
  @RequirePermissions('contacts:delete')
  @Audited('segments:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSegment(@Param('id', ParseUUIDPipe) id: string) {
    await this.segments.delete(id);
  }
}
