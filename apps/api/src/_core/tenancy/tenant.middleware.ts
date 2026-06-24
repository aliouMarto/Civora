import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { TenantContextService } from './tenant-context.service';

/**
 * TenantMiddleware — extrait l'agence_id et positionne le contexte tenant.
 *
 * À l'étape 04 : lecture depuis le header `x-agence-id` (temporaire).
 * À l'étape 05 (auth JWT) : remplacé par l'extraction du claim JWT.
 *
 * Le header `x-agence-id` sera supprimé à l'étape 05.
 * Ne jamais le laisser actif en production.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly tenantCtx: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // TODO étape 05 : remplacer par extraction JWT
    const agenceId = req.headers['x-agence-id'];

    if (!agenceId || typeof agenceId !== 'string' || agenceId.trim() === '') {
      // Pas de tenant → on laisse passer sans contexte.
      // TenantGuard bloquera les routes qui en ont besoin.
      next();
      return;
    }

    this.tenantCtx.run(agenceId.trim(), () => {
      this.logger.debug(`Tenant context set: ${agenceId}`);
      next();
    });
  }
}
