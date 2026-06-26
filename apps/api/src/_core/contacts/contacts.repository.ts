import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  ContactRole,
  ContactScoreCategorie,
  ContactSource,
  ContactSort,
} from '@civora/shared-types';

export interface ContactListFilters {
  agence_id: string;
  cursor?: string;
  limit: number;
  q?: string;
  role?: ContactRole[];
  ville?: string;
  commune?: string;
  pays?: string;
  source?: ContactSource;
  tags?: string[];
  segments_ia?: string[];
  score_min?: number;
  score_max?: number;
  score_categorie?: ContactScoreCategorie;
  whatsapp_opt_in?: boolean;
  created_after?: Date;
  created_before?: Date;
  include_archived?: boolean;
  sort: ContactSort;
}

export interface DuplicateLookup {
  agence_id: string;
  email?: string | null;
  telephone?: string | null;
  nom?: string | null;
  /** Renvoie aussi les similar matches via pg_trgm (uniquement si nom fourni). */
  fuzzy?: boolean;
  /** Exclut cet ID du résultat (utile pour update). */
  excludeId?: string;
}

export interface DuplicateRow {
  id: string;
  agence_id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  archived_at: Date | null;
  matched_on: ('email' | 'telephone' | 'nom_similaire')[];
  similarity: number | null;
}

const SORT_ORDER: Record<ContactSort, Prisma.ContactOrderByWithRelationInput[]> = {
  created_at_desc: [{ created_at: 'desc' }, { id: 'desc' }],
  nom_asc: [{ nom: 'asc' }, { id: 'asc' }],
  score_desc: [{ score_ia: 'desc' }, { id: 'desc' }],
  derniere_interaction_desc: [{ derniere_interaction_at: 'desc' }, { id: 'desc' }],
};

/**
 * Accès Prisma encapsulé pour le module Contacts.
 *
 * RÈGLE : aucun service du module ne touche directement à `this.prisma.contact`.
 * Tout passe par ce repository pour :
 *   1. Centraliser les filtres complexes (curseur, recherche trigram, soft delete).
 *   2. Garantir que l'auto-extension RLS de PrismaService (Lot 0 sécurité) est
 *      bien sollicitée (chaque opération wrap dans une transaction avec
 *      SET LOCAL app.agence_id si le contexte tenant est positionné).
 *   3. Faciliter le mock dans les tests unitaires des services.
 */
@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste paginée par curseur (id) avec filtres et tri. */
  async list(filters: ContactListFilters): Promise<{
    items: Awaited<ReturnType<PrismaService['contact']['findMany']>>;
    nextCursor: string | null;
  }> {
    const where = this.buildListWhere(filters);
    const orderBy = SORT_ORDER[filters.sort];

    const take = filters.limit + 1; // +1 pour détecter "hasMore"
    const items = await this.prisma.contact.findMany({
      where,
      orderBy,
      take,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > filters.limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }
    return { items, nextCursor };
  }

  findById(id: string): ReturnType<PrismaService['contact']['findUnique']> {
    return this.prisma.contact.findUnique({ where: { id } });
  }

  findByIdWithRelations(id: string) {
    return this.prisma.contact.findUnique({
      where: { id },
      include: {
        interactions: {
          orderBy: { occurred_at: 'desc' },
          take: 50,
        },
        segments_membre: {
          include: { segment: true },
        },
      },
    });
  }

  create(data: Prisma.ContactUncheckedCreateInput) {
    return this.prisma.contact.create({ data });
  }

  update(id: string, agence_id: string, data: Prisma.ContactUpdateInput) {
    // Filtre agence_id explicite (défense en profondeur en plus de la RLS).
    return this.prisma.contact.updateMany({
      where: { id, agence_id },
      data,
    });
  }

  archive(id: string, agence_id: string) {
    return this.prisma.contact.updateMany({
      where: { id, agence_id, archived_at: null },
      data: { archived_at: new Date() },
    });
  }

  /**
   * Détecte les doublons potentiels :
   *   - match exact sur email (si fourni)
   *   - match exact sur telephone (si fourni)
   *   - match fuzzy sur nom via pg_trgm (si fourni et fuzzy=true), seuil 0.4
   *
   * Le résultat indique sur quoi le match s'est fait.
   * Les contacts archivés sont inclus (un doublon archivé reste un doublon).
   */
  async findDuplicates(lookup: DuplicateLookup): Promise<DuplicateRow[]> {
    const { agence_id, email, telephone, nom, fuzzy, excludeId } = lookup;
    if (!email && !telephone && !nom) return [];

    // Construction des fragments OR
    const orParts: Prisma.Sql[] = [];
    if (email) orParts.push(Prisma.sql`email = ${email}`);
    if (telephone) orParts.push(Prisma.sql`telephone = ${telephone}`);
    if (nom && fuzzy) {
      orParts.push(Prisma.sql`similarity(nom, ${nom}) > 0.4`);
    }
    if (orParts.length === 0) return [];

    const orClause = Prisma.join(orParts, ' OR ');
    const excludeClause = excludeId
      ? Prisma.sql`AND id <> ${excludeId}::uuid`
      : Prisma.empty;
    const nomSimilarityExpr = nom
      ? Prisma.sql`similarity(nom, ${nom})`
      : Prisma.sql`NULL::real`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        agence_id: string;
        nom: string;
        prenom: string | null;
        email: string | null;
        telephone: string | null;
        archived_at: Date | null;
        matched_email: boolean;
        matched_telephone: boolean;
        nom_similarity: number | null;
      }>
    >(Prisma.sql`
      SELECT
        id,
        agence_id,
        nom,
        prenom,
        email,
        telephone,
        archived_at,
        (${email ?? null} IS NOT NULL AND email = ${email ?? null}) AS matched_email,
        (${telephone ?? null} IS NOT NULL AND telephone = ${telephone ?? null}) AS matched_telephone,
        ${nomSimilarityExpr} AS nom_similarity
      FROM contacts
      WHERE agence_id = ${agence_id}::uuid
        AND (${orClause})
        ${excludeClause}
      ORDER BY
        matched_email DESC,
        matched_telephone DESC,
        nom_similarity DESC NULLS LAST
      LIMIT 20
    `);

    return rows.map((r) => {
      const matched: DuplicateRow['matched_on'] = [];
      if (r.matched_email) matched.push('email');
      if (r.matched_telephone) matched.push('telephone');
      if (r.nom_similarity !== null && r.nom_similarity > 0.4) matched.push('nom_similaire');
      return {
        id: r.id,
        agence_id: r.agence_id,
        nom: r.nom,
        prenom: r.prenom,
        email: r.email,
        telephone: r.telephone,
        archived_at: r.archived_at,
        matched_on: matched,
        similarity: r.nom_similarity,
      };
    });
  }

  /**
   * Construction du WHERE pour list().
   * Recherche textuelle `q` : ILIKE avec wildcards sur nom/prenom/email/telephone.
   * Les index trigram (pg_trgm) accélèrent le ILIKE quand pattern >= 3 chars.
   */
  private buildListWhere(filters: ContactListFilters): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = {
      agence_id: filters.agence_id,
    };

    if (!filters.include_archived) {
      where.archived_at = null;
    }

    if (filters.q && filters.q.trim().length > 0) {
      const q = filters.q.trim();
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { prenom: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { telephone: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.role && filters.role.length > 0) {
      where.roles = { hasEvery: filters.role };
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasEvery: filters.tags };
    }
    if (filters.segments_ia && filters.segments_ia.length > 0) {
      where.segments_ia = { hasEvery: filters.segments_ia };
    }
    if (filters.ville) where.ville = filters.ville;
    if (filters.commune) where.commune = filters.commune;
    if (filters.pays) where.pays = filters.pays;
    if (filters.source) where.source = filters.source;
    if (filters.score_categorie) where.score_categorie = filters.score_categorie;
    if (filters.whatsapp_opt_in !== undefined) where.whatsapp_opt_in = filters.whatsapp_opt_in;

    if (filters.score_min !== undefined || filters.score_max !== undefined) {
      where.score_ia = {};
      if (filters.score_min !== undefined) where.score_ia.gte = filters.score_min;
      if (filters.score_max !== undefined) where.score_ia.lte = filters.score_max;
    }

    if (filters.created_after !== undefined || filters.created_before !== undefined) {
      where.created_at = {};
      if (filters.created_after) where.created_at.gte = filters.created_after;
      if (filters.created_before) where.created_at.lte = filters.created_before;
    }

    return where;
  }
}
