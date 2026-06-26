import { createHash, randomUUID } from 'node:crypto';

import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { PrismaAdminService } from '../../infrastructure/prisma/prisma-admin.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import type { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    // BYPASSRLS justifié : la résolution de l'invitation (pré-auth) précède
    // toute notion de contexte tenant. Le token de l'invitation joue le rôle
    // d'authentification d'usage unique.
    private readonly prismaAdmin: PrismaAdminService,
    private readonly auth: AuthService,
  ) {}

  async getMe(user: JwtPayload): Promise<object> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: user.sub },
      include: {
        roles: { include: { role: { select: { id: true, nom: true, permissions: true } } } },
      },
    });
    if (!utilisateur) throw new NotFoundException('User not found');

    const { password_hash: _ph, ...safe } = utilisateur;
    return { ...safe, permissions: user.permissions };
  }

  async createInvitation(
    dto: CreateUserDto,
    currentUser: JwtPayload,
  ): Promise<{ invitation_url: string }> {
    // Vérifier que le rôle cible appartient à la même agence (ou est système)
    const role = await this.prisma.role.findUnique({ where: { id: dto.role_id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.agence_id !== null && role.agence_id !== currentUser.agence_id) {
      throw new ForbiddenException('Cannot assign role from another agence');
    }

    const existing = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const token = randomUUID();
    const token_hash = createHash('sha256').update(token).digest('hex');
    const expire_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    await this.prisma.invitation.create({
      data: {
        agence_id: currentUser.agence_id,
        email: dto.email,
        role_id: dto.role_id,
        token_hash,
        expire_at,
        created_by: currentUser.sub,
      },
    });

    // TODO étape 09 : envoyer l'email via le service de notification
    const url = `https://app.civora.io/accept-invitation?token=${token}`;
    this.logger.log(`Invitation créée pour ${dto.email} — lien: ${url}`);

    return { invitation_url: url };
  }

  /** Accepte une invitation et crée le compte utilisateur. */
  async acceptInvitation(
    token: string,
    dto: Pick<CreateUserDto, 'password' | 'nom' | 'prenom'>,
  ): Promise<{ message: string }> {
    const token_hash = createHash('sha256').update(token).digest('hex');
    // Lookup pré-auth via prismaAdmin (BYPASSRLS) : le token est l'identifiant
    // implicite de l'agence, on ne peut pas encore positionner le contexte tenant.
    const invitation = await this.prismaAdmin.invitation.findFirst({
      where: { token_hash, utilisee_at: null },
    });

    if (!invitation || invitation.expire_at < new Date()) {
      throw new NotFoundException('Invitation invalide ou expirée');
    }

    const password_hash = await this.auth.hashPassword(dto.password);

    await this.prisma.withTenant(invitation.agence_id, async (tx) => {
      const utilisateur = await tx.utilisateur.create({
        data: {
          agence_id: invitation.agence_id,
          email: invitation.email,
          password_hash,
          nom: dto.nom,
          prenom: dto.prenom,
          statut: 'actif',
        },
      });

      await tx.utilisateurRole.create({
        data: { utilisateur_id: utilisateur.id, role_id: invitation.role_id },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { utilisee_at: new Date() },
      });
    });

    return { message: 'Compte créé avec succès' };
  }
}
