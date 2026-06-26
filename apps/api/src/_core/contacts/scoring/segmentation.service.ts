import { Injectable, Logger } from '@nestjs/common';
import type { Contact } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

/**
 * Segments IA déterministes calculés à partir des données contact + scoring.
 * La liste est fermée pour éviter l'inflation incontrôlée — toute nouvelle
 * étiquette doit être ajoutée ici explicitement.
 */
export const AUTO_SEGMENTS = [
  'vip',
  'investisseur',
  'voyageur_recurrent',
  'lead_chaud',
  'a_reactiver',
] as const;
export type AutoSegment = (typeof AUTO_SEGMENTS)[number];

export interface SegmentationContext {
  /** Score historique max connu (pour la règle "À réactiver"). null si jamais scoré. */
  historical_max_score?: number | null;
  /** Nombre de biens détenus par ce contact (R1/R2). 0 si pas branché. */
  owned_biens?: number;
  /** Nombre de séjours réservés (R4). 0 si pas branché. */
  past_stays?: number;
}

const REACTIVATION_DAYS_THRESHOLD = 180;
const VIP_SCORE_THRESHOLD = 80;
const LEAD_CHAUD_SCORE_THRESHOLD = 70;
const RECURRENT_TRAVELER_MIN_STAYS = 3;
const INVESTOR_MIN_BIENS = 3;
const REACTIVATION_HISTORICAL_THRESHOLD = 50;

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule les segments d'un contact à partir de ses données + contexte optionnel.
   * Fonction pure (pas d'IO) — facilement testable.
   */
  compute(contact: Contact, ctx: SegmentationContext = {}): AutoSegment[] {
    const segments = new Set<AutoSegment>();

    // VIP : score >= 80 ET (acheteur OU proprietaire)
    if (
      (contact.score_ia ?? 0) >= VIP_SCORE_THRESHOLD &&
      (contact.roles.includes('acheteur') || contact.roles.includes('proprietaire'))
    ) {
      segments.add('vip');
    }

    // Investisseur : tag explicite OU propriétaire avec ≥ 3 biens
    if (
      contact.tags.includes('investisseur') ||
      (contact.roles.includes('proprietaire') && (ctx.owned_biens ?? 0) >= INVESTOR_MIN_BIENS)
    ) {
      segments.add('investisseur');
    }

    // Voyageur récurrent : roles contient voyageur ET ≥ 3 séjours
    if (
      contact.roles.includes('voyageur') &&
      (ctx.past_stays ?? 0) >= RECURRENT_TRAVELER_MIN_STAYS
    ) {
      segments.add('voyageur_recurrent');
    }

    // Lead chaud : score >= 70 ET prospect
    if (
      (contact.score_ia ?? 0) >= LEAD_CHAUD_SCORE_THRESHOLD &&
      contact.roles.includes('prospect')
    ) {
      segments.add('lead_chaud');
    }

    // À réactiver : dernière interaction > 180j ET score historique >= 50
    if (contact.derniere_interaction_at) {
      const daysSince =
        (Date.now() - contact.derniere_interaction_at.getTime()) / (24 * 60 * 60 * 1000);
      const historicalMax = ctx.historical_max_score ?? contact.score_ia ?? 0;
      if (daysSince > REACTIVATION_DAYS_THRESHOLD && historicalMax >= REACTIVATION_HISTORICAL_THRESHOLD) {
        segments.add('a_reactiver');
      }
    }

    return [...segments];
  }

  /**
   * Recalcule et persiste les segments_ia d'un contact.
   * Préserve les segments custom non-auto (non présents dans AUTO_SEGMENTS).
   */
  async refreshFor(contactId: string, ctx: SegmentationContext = {}): Promise<AutoSegment[]> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new Error(`Contact ${contactId} introuvable`);

    const autoSegs = this.compute(contact, ctx);

    // Préserver les segments non-auto (custom, manuels)
    const customSegs = contact.segments_ia.filter(
      (s) => !AUTO_SEGMENTS.includes(s as AutoSegment),
    );

    const finalSegs = [...new Set([...customSegs, ...autoSegs])];

    // No-op si identique (évite write inutile)
    const isSame =
      finalSegs.length === contact.segments_ia.length &&
      finalSegs.every((s) => contact.segments_ia.includes(s));
    if (isSame) return autoSegs;

    await this.prisma.withTenant(contact.agence_id, (tx) =>
      tx.contact.update({
        where: { id: contactId },
        data: { segments_ia: finalSegs },
      }),
    );

    this.logger.debug(
      `Contact ${contactId}: segments_ia [${contact.segments_ia.join(',')}] → [${finalSegs.join(',')}]`,
    );
    return autoSegs;
  }
}
