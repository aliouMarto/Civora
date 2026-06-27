import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { BiensRepository } from '../repositories/biens.repository';
import { computeYieldBrutPct } from '../scoring/scoring-formula';

/**
 * Génère des insights actionnables sur le portefeuille de l'agence.
 *
 * 5 types couverts à ce stade :
 *   - pricing_sur_marche      (loyer > 115 % de la médiane commune+type+chambres)
 *   - pricing_sous_marche     (loyer < 80 %)
 *   - diversification_faible (> 50 % du parc dans une commune)
 *   - demande_forte_zone     (occupation commune > 90 %)
 *   - anomalie_loyer         (yield_brut_pct > 25 % ou < 1 %)
 *
 * Idempotent : avant insertion, on supprime les insights `dismissed_at IS NULL`
 * et `acted_on_at IS NULL` de mêmes type+cible_id (évite la duplication à
 * chaque recalcul). Les insights traités/ignorés restent intacts pour audit.
 */
@Injectable()
export class BiensInsightsService {
  private readonly logger = new Logger(BiensInsightsService.name);
  private static readonly MODULE = 'biens';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly repo: BiensRepository,
  ) {}

  /**
   * Lance une analyse complète du portefeuille et écrit les insights.
   * Renvoie le nombre d'insights générés par type.
   */
  async analyzePortfolio(): Promise<Record<string, number>> {
    const agence_id = this.tenantCtx.requireAgenceId();

    const generated: Record<string, number> = {};

    const biens = await this.prisma.bien.findMany({
      where: { agence_id, archived_at: null },
      select: {
        id: true, nom: true, commune: true, type: true, chambres: true,
        loyer_mensuel_xof: true, prix_vente_xof: true, statut: true,
      },
    });

    if (biens.length === 0) return generated;

    // ── 1. Anomalies prix/loyer
    for (const b of biens) {
      const yieldPct = computeYieldBrutPct(b.loyer_mensuel_xof, b.prix_vente_xof);
      if (yieldPct === null) continue;
      if (yieldPct > 25 || yieldPct < 1) {
        await this.upsertInsight({
          agence_id,
          type: yieldPct > 25 ? 'anomalie_loyer' : 'anomalie_prix',
          cible_type: 'bien',
          cible_id: b.id,
          severity: 'critical',
          titre: `Anomalie sur ${b.nom}`,
          message:
            yieldPct > 25
              ? `Rendement brut anormalement élevé (${yieldPct}%) — vérifier le prix de vente ou le loyer mensuel.`
              : `Rendement brut anormalement faible (${yieldPct}%) — possible erreur de saisie.`,
          action_label: 'Vérifier le bien',
          action_url: `/biens/${b.id}`,
          data: { yield_brut_pct: yieldPct, loyer_mensuel_xof: b.loyer_mensuel_xof?.toString(), prix_vente_xof: b.prix_vente_xof?.toString() },
        });
        generated['anomalie'] = (generated['anomalie'] ?? 0) + 1;
      }
    }

    // ── 2. Pricing vs médiane commune+type+chambres
    const pricingGroups = new Map<string, Array<{ id: string; nom: string; loyer: bigint }>>();
    for (const b of biens) {
      if (!b.loyer_mensuel_xof || !b.commune) continue;
      const key = `${b.commune}|${b.type}|${b.chambres ?? '?'}`;
      const list = pricingGroups.get(key) ?? [];
      list.push({ id: b.id, nom: b.nom, loyer: b.loyer_mensuel_xof });
      pricingGroups.set(key, list);
    }
    for (const [, items] of pricingGroups) {
      if (items.length < 3) continue; // pas assez de comparables
      const sorted = items.map((i) => Number(i.loyer)).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      if (median === 0) continue;
      for (const item of items) {
        const ratio = Number(item.loyer) / median;
        if (ratio > 1.15) {
          await this.upsertInsight({
            agence_id,
            type: 'pricing_sur_marche',
            cible_type: 'bien',
            cible_id: item.id,
            severity: 'warn',
            titre: `${item.nom} au-dessus du marché`,
            message: `Loyer ${Math.round((ratio - 1) * 100)}% au-dessus de la médiane (${median} centimes FCFA) des biens similaires de la commune.`,
            action_label: 'Ajuster le loyer',
            action_url: `/biens/${item.id}?ajuster=loyer`,
            data: { loyer_actuel: item.loyer.toString(), mediane: String(median), ratio: ratio.toFixed(2) },
          });
          generated['pricing_sur_marche'] = (generated['pricing_sur_marche'] ?? 0) + 1;
        } else if (ratio < 0.8) {
          await this.upsertInsight({
            agence_id,
            type: 'pricing_sous_marche',
            cible_type: 'bien',
            cible_id: item.id,
            severity: 'info',
            titre: `${item.nom} en sous-marché`,
            message: `Loyer ${Math.round((1 - ratio) * 100)}% sous la médiane (${median} centimes FCFA) des biens similaires.`,
            action_label: 'Augmenter le loyer',
            action_url: `/biens/${item.id}?ajuster=loyer`,
            data: { loyer_actuel: item.loyer.toString(), mediane: String(median), ratio: ratio.toFixed(2) },
          });
          generated['pricing_sous_marche'] = (generated['pricing_sous_marche'] ?? 0) + 1;
        }
      }
    }

    // ── 3. Diversification faible (> 50 % du parc dans une commune)
    const byCommune = new Map<string, number>();
    for (const b of biens) {
      if (!b.commune) continue;
      byCommune.set(b.commune, (byCommune.get(b.commune) ?? 0) + 1);
    }
    for (const [commune, n] of byCommune) {
      if (n / biens.length > 0.5) {
        await this.upsertInsight({
          agence_id,
          type: 'diversification_faible',
          cible_type: 'agence',
          cible_id: null,
          severity: 'warn',
          titre: `Concentration forte sur ${commune}`,
          message: `${n} biens sur ${biens.length} (${Math.round((n / biens.length) * 100)}%) sont à ${commune}. Diversifier sur d'autres communes réduit le risque.`,
          action_label: 'Voir biens hors zone',
          action_url: `/biens?commune!=${encodeURIComponent(commune)}`,
          data: { commune, count: n, total: biens.length },
        });
        generated['diversification_faible'] = (generated['diversification_faible'] ?? 0) + 1;
      }
    }

    // ── 4. Demande forte zone (taux loues / total commune > 90 %)
    const communeStats = new Map<string, { loues: number; total: number }>();
    for (const b of biens) {
      if (!b.commune) continue;
      const stat = communeStats.get(b.commune) ?? { loues: 0, total: 0 };
      stat.total++;
      if (b.statut === 'loue') stat.loues++;
      communeStats.set(b.commune, stat);
    }
    for (const [commune, stat] of communeStats) {
      if (stat.total < 3) continue;
      const ratio = stat.loues / stat.total;
      if (ratio > 0.9) {
        await this.upsertInsight({
          agence_id,
          type: 'demande_forte_zone',
          cible_type: 'commune',
          cible_id: null,
          severity: 'info',
          titre: `Forte demande à ${commune}`,
          message: `${Math.round(ratio * 100)}% des biens à ${commune} sont loués (${stat.loues}/${stat.total}). Opportunité d'acquisition.`,
          action_label: 'Acquérir dans cette commune',
          action_url: `/biens?commune=${encodeURIComponent(commune)}&statut=disponible`,
          data: { commune, ratio: ratio.toFixed(2), loues: stat.loues, total: stat.total },
        });
        generated['demande_forte_zone'] = (generated['demande_forte_zone'] ?? 0) + 1;
      }
    }

    this.logger.log(`Insights biens générés pour ${agence_id} : ${JSON.stringify(generated)}`);
    return generated;
  }

  /**
   * Upsert : ré-écrit l'insight s'il existe déjà non-dismissé/non-traité.
   */
  private async upsertInsight(input: {
    agence_id: string;
    type: string;
    cible_type: 'bien' | 'commune' | 'agence';
    cible_id: string | null;
    severity: 'info' | 'warn' | 'critical';
    titre: string;
    message: string;
    action_label?: string;
    action_url?: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.withTenant(input.agence_id, async (tx) => {
      // Purge des insights actifs identiques (même type + cible)
      await tx.insight.deleteMany({
        where: {
          agence_id: input.agence_id,
          module: BiensInsightsService.MODULE,
          type: input.type,
          cible_type: input.cible_type,
          cible_id: input.cible_id,
          dismissed_at: null,
          acted_on_at: null,
        },
      });
      await tx.insight.create({
        data: {
          agence_id: input.agence_id,
          module: BiensInsightsService.MODULE,
          type: input.type,
          cible_type: input.cible_type,
          cible_id: input.cible_id,
          severity: input.severity,
          titre: input.titre,
          message: input.message,
          action_label: input.action_label ?? null,
          action_url: input.action_url ?? null,
          data: input.data,
        },
      });
    });
  }
}
