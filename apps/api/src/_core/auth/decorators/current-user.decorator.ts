import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;        // utilisateur_id
  agence_id: string;
  email: string;
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
