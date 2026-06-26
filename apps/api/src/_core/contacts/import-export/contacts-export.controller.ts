import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';

import { Audited } from '../../audit/audit.decorator';
import { AuditInterceptor } from '../../audit/audit.interceptor';
import { CurrentUser, type JwtPayload } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';

import { ContactsExportDto } from './dto';
import { ContactsExportService } from './contacts-export.service';

@Controller('contacts/export')
@UseInterceptors(AuditInterceptor)
export class ContactsExportController {
  constructor(private readonly svc: ContactsExportService) {}

  @Post()
  @RequirePermissions('contacts:export')
  @Audited('contacts:export.start')
  @HttpCode(HttpStatus.OK)
  async start(
    @Body() dto: ContactsExportDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.svc.start(
      { format: dto.format, filtres: dto.filtres as never, columns: dto.columns as never },
      user.sub,
    );

    if (result.mode === 'sync') {
      res.setHeader('Content-Type', result.content_type);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.body);
      return;
    }
    res.json(result);
  }

  @Get(':id')
  @RequirePermissions('contacts:read')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getStatus(id);
  }
}
