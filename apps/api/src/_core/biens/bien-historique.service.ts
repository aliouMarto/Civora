import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BiensService } from './biens.service';

/**
 * Service de lecture de l'historique d'un bien.
 *
 * L'écriture est déclenchée par les events des autres modules (R2 baux,
 * R3 ventes, R4 réservations) — une fois ces modules livrés, on ajoutera
 * des handlers @OnDomainEvent qui inséreront ici. Pour l'instant, le
 * service expose juste la lecture paginée.
 */
@Injectable()
export class BienHistoriqueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly biens: BiensService,
  ) {}

  async list(bienId: string, page = 1, limit = 50) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.biens.getByIdOrThrow(bienId);
    const [items, total] = await Promise.all([
      this.prisma.bienHistorique.findMany({
        where: { bien_id: bien.id, agence_id },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bienHistorique.count({ where: { bien_id: bien.id, agence_id } }),
    ]);
    return { items, total, page, limit };
  }
}
