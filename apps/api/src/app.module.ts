import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './_core/auth/auth.module';
import { EventsModule } from './_core/events/events.module';
import { JobsModule } from './_core/jobs/jobs.module';
import { StorageModule } from './_core/storage/storage.module';
import { NotificationsModule } from './_core/notifications/notifications.module';
import { BullBoardModule } from './_core/jobs/bull-board.module';
import { TenancyModule } from './_core/tenancy/tenancy.module';
import { UsersModule } from './_core/users/users.module';
import { RbacModule } from './_core/rbac/rbac.module';
import { HealthModule } from './health/health.module';
import { DevModule } from './dev/dev.module';
import { envSchema } from './infrastructure/config/env.schema';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => envSchema.parse(config),
    }),
    TenancyModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    RbacModule,
    UsersModule,
    EventsModule,
    JobsModule,
    StorageModule,
    NotificationsModule,
    HealthModule,
    ...(process.env['NODE_ENV'] !== 'production' ? [DevModule, BullBoardModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
