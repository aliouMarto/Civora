import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

import { envSchema } from '../src/infrastructure/config/env.schema';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('PostgreSQL extensions', () => {
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

  it('postgis, vector, and pgcrypto are installed', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension
    `;
    const names = rows.map((r) => r.extname);
    expect(names).toContain('postgis');
    expect(names).toContain('vector');
    expect(names).toContain('pgcrypto');
  });
});
