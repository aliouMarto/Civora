import { Module } from '@nestjs/common';

import { TenancyModule } from '../tenancy/tenancy.module';
import { S3ClientService } from './s3-client';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [TenancyModule],
  providers: [S3ClientService, StorageService],
  controllers: [StorageController],
  exports: [StorageService, S3ClientService],
})
export class StorageModule {}
