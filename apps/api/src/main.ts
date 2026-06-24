import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Strip propriétés non déclarées dans le DTO
      forbidNonWhitelisted: true,  // 400 si propriétés inconnues présentes
      transform: true,        // Convertit automatiquement les types primitifs
    }),
  );

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  logger.log(`CIVORA API démarrée sur le port ${port}`);
}

void bootstrap();
