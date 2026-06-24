import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { envSchema } from '../src/infrastructure/config/env.schema';
import { RedisModule } from '../src/infrastructure/redis/redis.module';
import { RedisService } from '../src/infrastructure/redis/redis.service';

describe('RedisService', () => {
  let redis: RedisService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (config: Record<string, unknown>) => envSchema.parse(config),
        }),
        RedisModule,
      ],
    }).compile();

    redis = module.get(RedisService);
    await module.init();
  });

  afterAll(async () => {
    await module.close();
  });

  it('ping returns PONG', async () => {
    const result = await redis.ping();
    expect(result).toBe('PONG');
  });
});
