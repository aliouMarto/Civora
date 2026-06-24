import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { hasPermission, type Permission } from '../../rbac/permissions.catalog';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { JwtPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // Pas de permission requise déclarée → accès autorisé (authentification suffit)
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) return false;

    const granted = required.every((perm) => hasPermission(user.permissions, perm));
    if (!granted) {
      throw new ForbiddenException(
        `Missing permission: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
