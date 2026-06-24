import { S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infrastructure/config/env.schema';

/**
 * Client S3 configuré pour R2 (prod) ou MinIO (dev).
 *
 * R2 (prod) : endpoint = https://<account_id>.r2.cloudflarestorage.com
 * MinIO (dev) : endpoint = http://localhost:9000
 *
 * L'API est identique dans les deux cas — AWS SDK v3 gère la compatibilité S3.
 */
@Injectable()
export class S3ClientService {
  readonly client: S3Client;
  readonly bucket: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });

    if (nodeEnv === 'production') {
      const accountId = this.config.get('R2_ACCOUNT_ID', { infer: true });
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.config.get('R2_ACCESS_KEY_ID', { infer: true }),
          secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY', { infer: true }),
        },
      });
      this.bucket = this.config.get('R2_BUCKET', { infer: true });
    } else {
      // Dev / test : MinIO
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint: this.config.get('MINIO_ENDPOINT', { infer: true }) ?? 'http://localhost:9000',
        credentials: {
          accessKeyId: this.config.get('MINIO_ACCESS_KEY', { infer: true }) ?? 'minioadmin',
          secretAccessKey: this.config.get('MINIO_SECRET_KEY', { infer: true }) ?? 'minioadmin',
        },
        forcePathStyle: true, // obligatoire pour MinIO
      });
      this.bucket = this.config.get('MINIO_BUCKET', { infer: true }) ?? 'civora-dev';
    }
  }
}
