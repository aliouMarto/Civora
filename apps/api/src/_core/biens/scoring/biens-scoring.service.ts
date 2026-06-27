import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { BiensRepository } from '../repositories/biens.repository';
import {
  computeBienScore,
  computeYieldBrutPct,
} from './scoring-formula';
import type {
  BienMarketContext,
  BienScoreBreakdown,
  BienScoreFeatures,
} from '@civora/shared-types';

@Injectable()
export class BiensScoringService {
  private readonly logger = new Logger(BiensScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly repo: BiensRepository,
  ) {}

  /**
   * Calcule (sans persister) le score d'un bien à partir des features
   * et du contexte marché courant. Sert pour preview + endpoint
   * score-explanation.
   */
  async explain(bienId: string): Promise<BienScoreBreakdown> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const bien = await this.repo.findById(bienId);
    if (!bien || bien.agence_id !== agence_id) {
      throw new Error(`Bien ${bienId} introuvable`);
    }

    const features: BienScoreFeatures = {
      yield_brut_pct:
        bien.yield_brut_pct !== null
          ? Number(bien.yield_brut_pct)
          : computeYieldBrutPct(bien.loyer_mensuel_xof, bien.prix_vente_xof),
      tags: bien.tags,
      statut: bien.statut,
      // R2 viendra remplir occupation_12m et impaye_count_12m
      occupation_12m: null,
      impaye_count_12m: null,
    };

    const market = await this.buildMarketContext(agence_id, bien);
    return computeBienScore(features, market);
  }

  /**
   * Calcule ET persiste le score sur le bien.
   * Renvoie le breakdown calculé + indique si le score a "vraiment" changé
   * (delta ≥ 5 points → anti-bruit).
   */
  async scoreAndSave(bienId: string): Promise<{
    breakdown: BienScoreBreakdown;
    changed: boolean;
    previous_score: number | null;
  }> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const breakdown = await this.explain(bienId);
    const before = await this.repo.findById(bienId);
    if (!before) throw new Error(`Bien ${bienId} introuvable`);

    const previous = before.score_ia;
    const next = breakdown.global.value;
    const changed = previous === null || Math.abs(next - previous) >= 5;

    await this.prisma.withTenant(agence_id, (tx) =>
      tx.bien.update({
        where: { id: bienId },
        data: {
          score_ia: next,
          score_occupation: breakdown.sub_scores.occupation.grade,
          score_rentabilite: breakdown.sub_scores.rentabilite.grade,
          score_diversification: breakdown.sub_scores.risque.grade,
          score_risque_impaye: breakdown.sub_scores.risque.grade,
          score_updated_at: new Date(),
          yield_brut_pct:
            before.yield_brut_pct ??
            computeYieldBrutPct(before.loyer_mensuel_xof, before.prix_vente_xof),
          yield_updated_at: new Date(),
        },
      }),
    );

    return { breakdown, changed, previous_score: previous };
  }

  /**
   * Charge le contexte marché : statistiques de la commune + diversification
   * dans le portefeuille de l'agence.
   */
  private async buildMarketContext(
    agence_id: string,
    bien: { commune: string | null; type: string },
  ): Promise<BienMarketContext> {
    if (!bien.commune) {
      return { commune_total: 0, commune_loues: 0, is_unique_type_commune: false };
    }
    const [commune_total, commune_loues, sameTypeCommune] = await Promise.all([
      this.prisma.bien.count({
        where: { agence_id, commune: bien.commune, archived_at: null },
      }),
      this.prisma.bien.count({
        where: { agence_id, commune: bien.commune, archived_at: null, statut: 'loue' },
      }),
      this.prisma.bien.count({
        where: {
          agence_id,
          commune: bien.commune,
          type: bien.type as 'villa',
          archived_at: null,
        },
      }),
    ]);
    return {
      commune_total,
      commune_loues,
      is_unique_type_commune: sameTypeCommune <= 1,
    };
  }
}
