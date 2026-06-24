import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { envSchema } from '../src/infrastructure/config/env.schema';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('PrismaService', () => {
  let prisma: PrismaService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (config: Record<string, unknown>) => envSchema.parse(config),
        }),
        PrismaModule,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    await module.init();
  });

  afterAll(async () => {
    await module.close();
  });

  it('SELECT 1 returns expected result', async () => {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT 1`;
    expect(result).toHaveLength(1);
    expect(Object.values(result[0]!)[0]).toBe(1n);
  });
});
