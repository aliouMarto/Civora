import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Env } from '../config/env.schema';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.client = new Redis(this.config.get('REDIS_URL', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    const pong = await this.client.ping();
    this.logger.log(`Connected to Redis — ping: ${pong}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
