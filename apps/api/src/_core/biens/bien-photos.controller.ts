import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';

import { Audited } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

import { BienPhotosService } from './bien-photos.service';
import { RegisterPhotoDto, ReorderPhotosDto, UploadPhotoDto } from './dto/upload-photo.dto';

@Controller('biens/:id/photos')
@UseInterceptors(AuditInterceptor)
export class BienPhotosController {
  constructor(private readonly photos: BienPhotosService) {}

  @Get()
  @RequirePermissions('biens:read')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.photos.listForBien(id);
  }

  @Post('upload-url')
  @RequirePermissions('biens:write')
  uploadUrl(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadPhotoDto) {
    return this.photos.createUploadUrl(id, dto);
  }

  @Post()
  @RequirePermissions('biens:write')
  @Audited('biens:photo_add')
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPhotoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.photos.register(id, dto, user);
  }

  @Patch('reorder')
  @RequirePermissions('biens:write')
  @Audited('biens:photo_reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderPhotosDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.photos.reorder(id, dto, user);
  }

  @Delete(':photoId')
  @RequirePermissions('biens:write')
  @Audited('biens:photo_delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.photos.delete(id, photoId, user);
  }
}
