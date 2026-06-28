import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

/**
 * Logger structuré JSON via pino.
 * En dev (NODE_ENV != production), sortie pretty via pino-pretty si disponible.
 * En prod, sortie JSON pure vers stdout (sink configuré au niveau infra).
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: pino.Logger;

  constructor() {
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    this.logger = pino({
      level: nodeEnv === 'production' ? 'info' : 'debug',
      ...(nodeEnv !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, singleLine: false, ignore: 'pid,hostname' },
            },
          }
        : {}),
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: { service: 'civora-api' },
    });
  }

  log(message: string, context?: string): void {
    this.logger.info({ context }, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context }, message);
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context }, message);
  }

  verbose(message: string, context?: string): void {
    this.logger.trace({ context }, message);
  }

  /** Crée un child logger avec des champs contextuels fixes. */
  child(bindings: Record<string, unknown>): pino.Logger {
    return this.logger.child(bindings);
  }
}
