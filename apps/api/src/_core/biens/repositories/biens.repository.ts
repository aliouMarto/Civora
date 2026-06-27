import { Injectable } from '@nestjs/common';
import { Prisma, type Bien } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  BienSort,
  BienStatut,
  BienType,
  BienUsage,
} from '@civora/shared-types';

export interface BienListFilters {
  agence_id: string;
  cursor?: string;
  limit: number;
  q?: string;
  statut?: BienStatut[];
  type?: BienType[];
  usage?: BienUsage[];
  ville?: string[];
  commune?: string[];
  proprietaire_id?: string;
  agent_responsable_id?: string;
  prix_vente_min?: bigint;
  prix_vente_max?: bigint;
  loyer_min?: bigint;
  loyer_max?: bigint;
  surface_min?: number;
  surface_max?: number;
  chambres_min?: number;
  amenities?: string[];
  tags?: string[];
  score_min?: number;
  score_max?: number;
  include_archived?: boolean;
  sort: BienSort;
}

const SORT_ORDER: Record<BienSort, Prisma.BienOrderByWithRelationInput[]> = {
  created_desc: [{ created_at: 'desc' }, { id: 'desc' }],
  prix_asc: [{ prix_vente_xof: 'asc' }, { id: 'asc' }],
  prix_desc: [{ prix_vente_xof: 'desc' }, { id: 'desc' }],
  score_desc: [{ score_ia: 'desc' }, { id: 'desc' }],
  surface_desc: [{ surface: 'desc' }, { id: 'desc' }],
};

/**
 * Accès Prisma encapsulé. L'auto-extension RLS de PrismaService garantit
 * que chaque opération est exécutée dans une transaction tenant-pinned
 * (SET LOCAL app.agence_id) tant que le contexte est positionné.
 *
 * Aucun service du module ne touche `this.prisma.bien` directement.
 */
@Injectable()
export class BiensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: BienListFilters): Promise<{ items: Bien[]; nextCursor: string | null }> {
    const where = this.buildWhere(filters);
    const orderBy = SORT_ORDER[filters.sort];

    const take = filters.limit + 1;
    const items = await this.prisma.bien.findMany({
      where,
      orderBy,
      take,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > filters.limit) {
      nextCursor = items.pop()!.id;
    }
    return { items, nextCursor };
  }

  findById(id: string) {
    return this.prisma.bien.findUnique({ where: { id } });
  }

  findByIdWithRelations(id: string) {
    return this.prisma.bien.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { ordre: 'asc' } },
        historique: { orderBy: { created_at: 'desc' }, take: 50 },
      },
    });
  }

  countByAgence(agence_id: string, year: number): Promise<number> {
    return this.prisma.bien.count({
      where: {
        agence_id,
        reference: { startsWith: `BIE-${year}-` },
      },
    });
  }

  create(data: Prisma.BienUncheckedCreateInput) {
    return this.prisma.bien.create({ data });
  }

  update(id: string, agence_id: string, data: Prisma.BienUpdateInput) {
    return this.prisma.bien.updateMany({
      where: { id, agence_id, archived_at: null },
      data,
    });
  }

  archive(id: string, agence_id: string) {
    return this.prisma.bien.updateMany({
      where: { id, agence_id, archived_at: null },
      data: { archived_at: new Date() },
    });
  }

  private buildWhere(filters: BienListFilters): Prisma.BienWhereInput {
    const where: Prisma.BienWhereInput = { agence_id: filters.agence_id };
    if (!filters.include_archived) where.archived_at = null;

    if (filters.q && filters.q.trim().length > 0) {
      const q = filters.q.trim();
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.statut && filters.statut.length > 0) where.statut = { in: filters.statut };
    if (filters.type && filters.type.length > 0) where.type = { in: filters.type };
    if (filters.usage && filters.usage.length > 0) where.usage = { in: filters.usage };
    if (filters.ville && filters.ville.length > 0) where.ville = { in: filters.ville };
    if (filters.commune && filters.commune.length > 0) where.commune = { in: filters.commune };
    if (filters.proprietaire_id) where.proprietaire_id = filters.proprietaire_id;
    if (filters.agent_responsable_id) where.agent_responsable_id = filters.agent_responsable_id;

    if (filters.prix_vente_min !== undefined || filters.prix_vente_max !== undefined) {
      where.prix_vente_xof = {};
      if (filters.prix_vente_min !== undefined) where.prix_vente_xof.gte = filters.prix_vente_min;
      if (filters.prix_vente_max !== undefined) where.prix_vente_xof.lte = filters.prix_vente_max;
    }
    if (filters.loyer_min !== undefined || filters.loyer_max !== undefined) {
      where.loyer_mensuel_xof = {};
      if (filters.loyer_min !== undefined) where.loyer_mensuel_xof.gte = filters.loyer_min;
      if (filters.loyer_max !== undefined) where.loyer_mensuel_xof.lte = filters.loyer_max;
    }
    if (filters.surface_min !== undefined || filters.surface_max !== undefined) {
      where.surface = {};
      if (filters.surface_min !== undefined) where.surface.gte = filters.surface_min;
      if (filters.surface_max !== undefined) where.surface.lte = filters.surface_max;
    }
    if (filters.chambres_min !== undefined) where.chambres = { gte: filters.chambres_min };

    if (filters.amenities && filters.amenities.length > 0) {
      where.amenities = { hasEvery: filters.amenities };
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasEvery: filters.tags };
    }
    if (filters.score_min !== undefined || filters.score_max !== undefined) {
      where.score_ia = {};
      if (filters.score_min !== undefined) where.score_ia.gte = filters.score_min;
      if (filters.score_max !== undefined) where.score_ia.lte = filters.score_max;
    }
    return where;
  }
}
