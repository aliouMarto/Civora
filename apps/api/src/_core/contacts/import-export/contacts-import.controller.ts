import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';

import { Audited } from '../../audit/audit.decorator';
import { AuditInterceptor } from '../../audit/audit.interceptor';
import { CurrentUser, type JwtPayload } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';

import {
  CreateImportUploadDto,
  ImportExecuteDto,
  ImportPreviewDto,
} from './dto';
import { ContactsImportService } from './contacts-import.service';

@Controller('contacts/import')
@UseInterceptors(AuditInterceptor)
export class ContactsImportController {
  constructor(private readonly svc: ContactsImportService) {}

  @Post('upload')
  @RequirePermissions('contacts:write')
  createUpload(@Body() dto: CreateImportUploadDto) {
    return this.svc.createUploadUrl({
      ext: dto.ext,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
    });
  }

  @Post('preview')
  @RequirePermissions('contacts:write')
  preview(@Body() dto: ImportPreviewDto) {
    return this.svc.preview({
      file_key: dto.file_key,
      mapping: dto.mapping as never,
      options: dto.options,
    });
  }

  @Post('execute')
  @RequirePermissions('contacts:write')
  @Audited('contacts:import.execute')
  execute(@Body() dto: ImportExecuteDto, @CurrentUser() user: JwtPayload) {
    return this.svc.execute(
      {
        file_key: dto.file_key,
        mapping: dto.mapping as never,
        options: dto.options,
      },
      user.sub,
    );
  }

  @Get(':id')
  @RequirePermissions('contacts:read')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getStatus(id);
  }

  @Get(':id/errors')
  @RequirePermissions('contacts:read')
  errors(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getErrorsDownloadUrl(id);
  }
}
