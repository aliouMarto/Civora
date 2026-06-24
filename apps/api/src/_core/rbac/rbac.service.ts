import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { hasPermission, type Permission } from './permissions.catalog';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserPermissions(utilisateurId: string): Promise<string[]> {
    const roles = await this.prisma.utilisateurRole.findMany({
      where: { utilisateur_id: utilisateurId },
      include: { role: { select: { permissions: true } } },
    });

    const perms = new Set<string>();
    for (const ur of roles) {
      for (const p of ur.role.permissions) perms.add(p);
    }
    return [...perms];
  }

  async userHasPermission(utilisateurId: string, permission: Permission): Promise<boolean> {
    const perms = await this.getUserPermissions(utilisateurId);
    return hasPermission(perms, permission);
  }

  async getRolesForAgence(agenceId: string): Promise<object[]> {
    return this.prisma.role.findMany({
      where: { OR: [{ agence_id: agenceId }, { agence_id: null, systeme: true }] },
    });
  }

  async getSystemRoles(): Promise<object[]> {
    return this.prisma.role.findMany({ where: { systeme: true } });
  }

  async getRoleById(id: string): Promise<object> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }
}
