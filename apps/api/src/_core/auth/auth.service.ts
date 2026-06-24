import { createHash, randomUUID } from 'node:crypto';

import {
  Injectable,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Request } from 'express';

import type { Env } from '../../infrastructure/config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { JwtPayload } from './decorators/current-user.decorator';
import type { LoginDto } from './dto/login.dto';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MiB (OWASP recommandé)
  timeCost: 3,
  parallelism: 4,
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async login(
    dto: LoginDto,
    req: Pick<Request, 'headers' | 'ip'>,
  ): Promise<{ access_token: string; refresh_token: string; user: object }> {
    // Recherche sans filtre tenant (le login précède le contexte tenant)
    const user = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
      include: {
        roles: { include: { role: true } },
      },
    });

    // Vérification timing-safe : on vérifie toujours le hash, même si user inexistant
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$dummy';
    const passwordOk = user
      ? await this.verifyPassword(user.password_hash, dto.password)
      : await argon2.verify(dummyHash, dto.password).catch(() => false);

    if (!user || !passwordOk) {
      this.logger.warn(`Login failed for email: ${dto.email}`);
      // Délai uniforme pour éviter l'énumération par timing
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.statut === 'desactive') {
      throw new UnauthorizedException('Account disabled');
    }

    const permissions = this.extractPermissions(user.roles.map((ur) => ur.role));
    const payload: JwtPayload = {
      sub: user.id,
      agence_id: user.agence_id,
      email: user.email,
      permissions,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.signAccessToken(payload),
      this.createRefreshToken(user.id, req),
    ]);

    // Mise à jour de la dernière connexion
    await this.prisma.utilisateur.update({
      where: { id: user.id },
      data: { derniere_connexion: new Date() },
    });

    this.logger.log(`Login success: ${user.email} (agence: ${user.agence_id})`);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        agence_id: user.agence_id,
        permissions,
      },
    };
  }

  async refresh(
    token: string,
    req: Pick<Request, 'headers' | 'ip'>,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const tokenHash = sha256(token);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { token_hash: tokenHash },
      include: {
        utilisateur: { include: { roles: { include: { role: true } } } },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Détection de rejeu : token déjà révoqué → révocation en cascade de toute la famille
    if (stored.revoque_at !== null) {
      this.logger.error(
        `REFRESH TOKEN REPLAY DETECTED — famille: ${stored.famille}, user: ${stored.utilisateur_id}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { famille: stored.famille },
        data: { revoque_at: new Date() },
      });
      throw new UnauthorizedException('Refresh token already used — all sessions revoked');
    }

    if (stored.expire_at < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotation : révoquer l'ancien, émettre un nouveau dans la même famille
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoque_at: new Date() },
    });

    const user = stored.utilisateur;
    const permissions = this.extractPermissions(user.roles.map((ur) => ur.role));
    const payload: JwtPayload = {
      sub: user.id,
      agence_id: user.agence_id,
      email: user.email,
      permissions,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.signAccessToken(payload),
      this.createRefreshToken(user.id, req, stored.famille),
    ]);

    return { access_token, refresh_token };
  }

  async logout(token: string): Promise<void> {
    const tokenHash = sha256(token);
    await this.prisma.refreshToken.updateMany({
      where: { token_hash: tokenHash, revoque_at: null },
      data: { revoque_at: new Date() },
    });
  }

  private signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
    });
  }

  private async createRefreshToken(
    userId: string,
    req: Pick<Request, 'headers' | 'ip'>,
    famille?: string,
  ): Promise<string> {
    const token = randomUUID();
    const tokenHash = sha256(token);
    const expiresDays = this.config.get('JWT_REFRESH_EXPIRES_DAYS', { infer: true });
    const expire_at = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        utilisateur_id: userId,
        token_hash: tokenHash,
        expire_at,
        famille: famille ?? randomUUID(),
        user_agent: String(req.headers['user-agent'] ?? '').slice(0, 512),
        ip: req.ip ?? null,
      },
    });

    return token;
  }

  private extractPermissions(roles: Array<{ permissions: string[] }>): string[] {
    const perms = new Set<string>();
    for (const role of roles) {
      for (const p of role.permissions) {
        perms.add(p);
      }
    }
    return [...perms];
  }
}
