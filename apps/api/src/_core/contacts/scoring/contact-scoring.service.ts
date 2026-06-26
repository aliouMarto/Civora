import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Contact } from '@prisma/client';

import type { Env } from '../../../infrastructure/config/env.schema';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { isValidE164 } from '../normalizers/phone.normalizer';

import {
  computeScore,
  type ScoringFeatures,
  type ScoringResult,
  type ContactSourceFeature,
} from './scoring-formula';

const PYTHON_TIMEOUT_MS = 5_000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Calcule et persiste le score IA d'un contact.
 *
 * Stratégie :
 *   1. Extraire les features depuis la DB (interactions 90j, profile).
 *   2. Appeler le service Python (AI_SERVICE_URL/score/contact) avec timeout 5s.
 *   3. Si le service Python échoue ou est indisponible, fallback sur l'heuristique
 *      TS identique (réimplémentée dans scoring-formula.ts).
 *   4. Émettre contact.score_changed uniquement si delta >= 5 (anti-bruit).
 */
@Injectable()
export class ContactScoringService {
  private readonly logger = new Logger(ContactScoringService.name);
  private readonly pythonUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.pythonUrl = this.config.get('AI_SERVICE_URL', { infer: true }) ?? null;
  }

  /**
   * Calcule le score d'un contact identifié par son ID.
   * Retourne le résultat sans le persister (utilisé par le worker et l'endpoint
   * de transparence). La persistance est faite par updateScore().
   */
  async score(contactId: string): Promise<ScoringResult> {
    const features = await this.computeFeatures(contactId);
    return this.scoreFromFeatures(features);
  }

  /**
   * Variante : score à partir de features pré-calculées. Tente d'abord le
   * service Python, fallback sur l'heuristique TS.
   */
  async scoreFromFeatures(features: ScoringFeatures): Promise<ScoringResult> {
    if (this.pythonUrl) {
      try {
        const result = await this.callPython(features);
        if (result) return result;
      } catch (err) {
        this.logger.warn(
          `Service Python /score/contact indisponible (${(err as Error).message}) — fallback heuristique TS`,
        );
      }
    }
    return computeScore(features);
  }

  /**
   * Calcule le score, persiste sur le contact, retourne { result, changed }.
   * `changed` est true si le score a varié de >= 5 points OU si la catégorie a changé.
   */
  async updateScore(contactId: string): Promise<{
    result: ScoringResult;
    changed: boolean;
    previousScore: number | null;
    previousCategorie: string | null;
  }> {
    const before = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { score_ia: true, score_categorie: true, agence_id: true },
    });
    if (!before) {
      throw new Error(`Contact ${contactId} introuvable`);
    }

    const result = await this.score(contactId);

    const scoreDelta = Math.abs((before.score_ia ?? 0) - result.score);
    const categoryChanged = before.score_categorie !== result.category;
    const changed = scoreDelta >= 5 || categoryChanged;

    await this.prisma.withTenant(before.agence_id, (tx) =>
      tx.contact.update({
        where: { id: contactId },
        data: {
          score_ia: result.score,
          score_categorie: result.category,
          score_updated_at: new Date(),
        },
      }),
    );

    return {
      result,
      changed,
      previousScore: before.score_ia,
      previousCategorie: before.score_categorie,
    };
  }

  /**
   * Extrait les features d'un contact depuis la base.
   * Public pour réutilisation par le worker et l'endpoint /score-explanation.
   */
  async computeFeatures(contactId: string): Promise<ScoringFeatures> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new Error(`Contact ${contactId} introuvable`);
    }
    return this.featuresFromContact(contact);
  }

  async featuresFromContact(contact: Contact): Promise<ScoringFeatures> {
    const now = Date.now();
    const ninetyDaysAgo = new Date(now - NINETY_DAYS_MS);

    const [outgoing, incoming, total] = await Promise.all([
      this.prisma.interaction.count({
        where: {
          contact_id: contact.id,
          direction: 'sortant',
          occurred_at: { gte: ninetyDaysAgo },
        },
      }),
      this.prisma.interaction.count({
        where: {
          contact_id: contact.id,
          direction: 'entrant',
          occurred_at: { gte: ninetyDaysAgo },
        },
      }),
      this.prisma.interaction.count({ where: { contact_id: contact.id } }),
    ]);

    const visits = await this.prisma.interaction.count({
      where: {
        contact_id: contact.id,
        type: 'visite',
        occurred_at: { gte: ninetyDaysAgo },
      },
    });

    const daysSinceLast =
      contact.derniere_interaction_at === null
        ? null
        : Math.floor((now - contact.derniere_interaction_at.getTime()) / (24 * 60 * 60 * 1000));

    const source = (contact.source as ContactSourceFeature) ?? null;
    const hasValidPhone = contact.telephone !== null && isValidE164(contact.telephone);

    return {
      has_email: contact.email !== null && contact.email.length > 0,
      has_valid_phone: hasValidPhone,
      has_address: Boolean(contact.ville && contact.commune),
      has_tag_or_segment: contact.tags.length > 0 || contact.segments_ia.length > 0,
      interactions_outgoing_90d: outgoing,
      interactions_incoming_90d: incoming,
      visits_completed_90d: visits,
      source,
      roles_count: contact.roles.length,
      whatsapp_opt_in: contact.whatsapp_opt_in,
      days_since_last_interaction: daysSinceLast,
      total_interactions: total,
    };
  }

  private async callPython(features: ScoringFeatures): Promise<ScoringResult | null> {
    if (!this.pythonUrl) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PYTHON_TIMEOUT_MS);

    try {
      const resp = await fetch(`${this.pythonUrl}/score/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as ScoringResult;
      // Validation minimale du contrat
      if (
        typeof json.score !== 'number' ||
        typeof json.category !== 'string' ||
        typeof json.confidence !== 'string' ||
        !Array.isArray(json.factors)
      ) {
        throw new Error('Réponse Python invalide');
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }
}
