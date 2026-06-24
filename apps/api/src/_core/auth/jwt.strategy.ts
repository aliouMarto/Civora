import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../infrastructure/config/env.schema';
import type { JwtPayload } from './decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !payload.agence_id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
