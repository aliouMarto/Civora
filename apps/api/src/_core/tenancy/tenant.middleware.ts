import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

import type { Env } from '../../infrastructure/config/env.schema';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantCtx: TenantContextService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const agenceId = this.extractAgenceId(req);

    if (!agenceId) {
      next();
      return;
    }

    this.tenantCtx.run(agenceId, () => {
      this.logger.debug(`Tenant context: ${agenceId}`);
      next();
    });
  }

  private extractAgenceId(req: Request): string | null {
    // 1. Extraction depuis le JWT (Authorization: Bearer <token>)
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
        const payload = jwt.verify(token, secret) as JwtPayload;
        if (payload.agence_id) return payload.agence_id;
      } catch {
        // Token invalide ou expiré → TenantGuard/JwtAuthGuard géreront l'erreur
      }
    }

    return null;
  }
}
