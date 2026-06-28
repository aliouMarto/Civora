import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

import { AppModule } from './app.module';

// BigInt → string in JSON.stringify (used for FCFA amounts stored as bigint).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: process.env['WEB_ORIGIN']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Strip propriétés non déclarées dans le DTO
      forbidNonWhitelisted: true,  // 400 si propriétés inconnues présentes
      transform: true,        // Convertit automatiquement les types primitifs
    }),
  );

  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  logger.log(`CIVORA API démarrée sur le port ${port}`);
}

void bootstrap();
