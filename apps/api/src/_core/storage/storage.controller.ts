import { Body, Controller, Post, Query, Get } from '@nestjs/common';

import { DownloadUrlDto, UploadUrlDto } from './dto/upload-url.dto';
import type { StorageKind } from './object-key';
import type { DownloadUrlResult, UploadUrlResult } from './storage.service';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload-url')
  async getUploadUrl(@Body() dto: UploadUrlDto): Promise<UploadUrlResult> {
    return this.storage.getUploadUrl({
      kind: dto.kind as StorageKind,
      ext: dto.ext,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      entite_id: dto.entite_id,
    });
  }

  @Get('download-url')
  async getDownloadUrl(@Query() dto: DownloadUrlDto): Promise<DownloadUrlResult> {
    return this.storage.getDownloadUrl(dto.key);
  }
}
