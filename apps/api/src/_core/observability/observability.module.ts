import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLoggerService } from './logger.service';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { MetricsController } from './metrics/metrics.controller';
import { initSentry } from './sentry.config';

@Module({
  providers: [PinoLoggerService],
  controllers: [MetricsController],
  exports: [PinoLoggerService],
})
export class ObservabilityModule implements NestModule {
  constructor(private readonly config: ConfigService) {
    initSentry(
      this.config.get<string>('SENTRY_DSN'),
      this.config.get<string>('NODE_ENV', 'development'),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
