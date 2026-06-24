import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';

/**
 * TenantGuard — protège les routes qui nécessitent un contexte tenant.
 * Retourne 401 si aucun agence_id n'est positionné dans le contexte courant.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantCtx: TenantContextService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    const agenceId = this.tenantCtx.getAgenceId();
    if (!agenceId) {
      throw new UnauthorizedException('Missing tenant context');
    }
    return true;
  }
}
