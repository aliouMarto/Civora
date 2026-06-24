import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { AUDITED_KEY, type AuditedMeta } from './audit.decorator';
import { AuditService } from './audit.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditedMeta | undefined>(AUDITED_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = req.user;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          action: meta.action,
          actorId: user?.sub ?? null,
          actorType: 'user',
          metadata: {
            ip: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
            correlationId: correlationId ?? null,
            method: req.method,
            path: req.path,
          },
        });
      }),
    );
  }
}
