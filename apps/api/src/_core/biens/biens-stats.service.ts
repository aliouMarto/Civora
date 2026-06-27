import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  BienPortefeuilleStat,
  BienRepartitionStat,
  BienStatut,
  BienType,
  BienUsage,
} from '@civora/shared-types';

@Injectable()
export class BiensStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async repartition(): Promise<BienRepartitionStat> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const [byStatut, byType, byUsage] = await Promise.all([
      this.prisma.bien.groupBy({
        by: ['statut'],
        where: { agence_id, archived_at: null },
        _count: true,
      }),
      this.prisma.bien.groupBy({
        by: ['type'],
        where: { agence_id, archived_at: null },
        _count: true,
      }),
      this.prisma.bien.groupBy({
        by: ['usage'],
        where: { agence_id, archived_at: null },
        _count: true,
      }),
    ]);
    return {
      par_statut: Object.fromEntries(byStatut.map((r) => [r.statut, r._count])) as Record<BienStatut, number>,
      par_type: Object.fromEntries(byType.map((r) => [r.type, r._count])) as Record<BienType, number>,
      par_usage: Object.fromEntries(byUsage.map((r) => [r.usage, r._count])) as Record<BienUsage, number>,
    };
  }

  /**
   * Portefeuille : valeur totale, MRR théorique, taux d'occupation.
   *
   * - valeur_patrimoniale = somme des prix_vente_xof (biens non archivés)
   * - mrr_theorique       = somme des loyer_mensuel_xof (disponibles + loués)
   * - taux_occupation     = loués / (disponibles + loués + saisonnier) × 100
   */
  async portefeuille(): Promise<BienPortefeuilleStat> {
    const agence_id = this.tenantCtx.requireAgenceId();

    const [agg, statutCounts] = await Promise.all([
      this.prisma.bien.aggregate({
        where: { agence_id, archived_at: null },
        _sum: { prix_vente_xof: true, loyer_mensuel_xof: true },
        _count: true,
      }),
      this.prisma.bien.groupBy({
        by: ['statut'],
        where: { agence_id, archived_at: null },
        _count: true,
      }),
    ]);

    const counts = Object.fromEntries(statutCounts.map((r) => [r.statut, r._count])) as Record<string, number>;
    const loues = counts['loue'] ?? 0;
    const dispo = counts['disponible'] ?? 0;
    const saiso = counts['saisonnier'] ?? 0;
    const denom = loues + dispo + saiso;
    const taux = denom > 0 ? Math.round(((loues + saiso) / denom) * 100) : 0;

    return {
      total_biens: agg._count,
      valeur_patrimoniale_xof: (agg._sum.prix_vente_xof ?? 0n).toString(),
      mrr_theorique_xof: (agg._sum.loyer_mensuel_xof ?? 0n).toString(),
      taux_occupation_pct: taux,
    };
  }
}
