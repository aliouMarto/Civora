import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface BienGeoRow {
  id: string;
  reference: string;
  nom: string;
  statut: string;
  type: string;
  usage: string;
  ville: string;
  commune: string | null;
  latitude: number;
  longitude: number;
  prix_vente_xof: bigint | null;
  loyer_mensuel_xof: bigint | null;
  score_ia: number | null;
  archived: boolean;
  distance_m?: number;
}

export interface SpatialFiltersRaw {
  statut?: string[];
  type?: string[];
  usage?: string[];
  prix_vente_min?: bigint;
  prix_vente_max?: bigint;
  loyer_min?: bigint;
  loyer_max?: bigint;
}

/**
 * Repository dédié aux requêtes PostGIS sur biens.
 *
 * Toutes les requêtes passent par `withTenant(agence_id, ...)` pour que la
 * politique RLS soit appliquée — l'auto-extension PrismaService ne couvre
 * pas $queryRaw/$queryRawUnsafe.
 *
 * Les paramètres sont toujours bindés via `Prisma.sql` (jamais
 * d'interpolation directe — pas d'injection SQL possible).
 */
@Injectable()
export class BiensGeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche radius : tous les biens géolocalisés dans `radius_meters`
   * autour de (lat, lng), avec distance retournée pour tri.
   */
  async searchRadius(params: {
    agence_id: string;
    center: { lat: number; lng: number };
    radius_meters: number;
    filters?: SpatialFiltersRaw;
    limit: number;
  }): Promise<BienGeoRow[]> {
    return this.prisma.withTenant(params.agence_id, async (tx) => {
      const filterClause = this.buildFilterClause(params.filters);
      const rows = await tx.$queryRaw<BienGeoRow[]>(Prisma.sql`
        SELECT
          id, reference, nom, statut::text AS statut, type::text AS type, usage::text AS usage,
          ville, commune,
          ST_Y(geo)::float8 AS latitude,
          ST_X(geo)::float8 AS longitude,
          prix_vente_xof, loyer_mensuel_xof, score_ia,
          (archived_at IS NOT NULL) AS archived,
          ST_Distance(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${params.center.lng}, ${params.center.lat}), 4326)::geography
          )::float8 AS distance_m
        FROM biens
        WHERE geo IS NOT NULL
          AND archived_at IS NULL
          AND ST_DWithin(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${params.center.lng}, ${params.center.lat}), 4326)::geography,
            ${params.radius_meters}
          )
          ${filterClause}
        ORDER BY distance_m ASC
        LIMIT ${params.limit}
      `);
      return rows;
    });
  }

  /**
   * Recherche bbox : tous les biens géolocalisés dans le rectangle.
   */
  async searchBbox(params: {
    agence_id: string;
    bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
    filters?: SpatialFiltersRaw;
    limit: number;
  }): Promise<BienGeoRow[]> {
    return this.prisma.withTenant(params.agence_id, async (tx) => {
      const [minLng, minLat, maxLng, maxLat] = params.bbox;
      const filterClause = this.buildFilterClause(params.filters);
      const rows = await tx.$queryRaw<BienGeoRow[]>(Prisma.sql`
        SELECT
          id, reference, nom, statut::text AS statut, type::text AS type, usage::text AS usage,
          ville, commune,
          ST_Y(geo)::float8 AS latitude,
          ST_X(geo)::float8 AS longitude,
          prix_vente_xof, loyer_mensuel_xof, score_ia,
          (archived_at IS NOT NULL) AS archived
        FROM biens
        WHERE geo IS NOT NULL
          AND archived_at IS NULL
          AND geo && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
          ${filterClause}
        ORDER BY created_at DESC
        LIMIT ${params.limit}
      `);
      return rows;
    });
  }

  /**
   * Recherche polygone : tous les biens à l'intérieur du polygone fermé
   * (le premier et le dernier point seront identiques après normalisation).
   */
  async searchPolygon(params: {
    agence_id: string;
    polygon: Array<[number, number]>; // [lng, lat]
    filters?: SpatialFiltersRaw;
    limit: number;
  }): Promise<BienGeoRow[]> {
    return this.prisma.withTenant(params.agence_id, async (tx) => {
      // WKT format : POLYGON((lng1 lat1, lng2 lat2, ..., lng1 lat1))
      const ring = [...params.polygon];
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
      const wkt = `POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
      const filterClause = this.buildFilterClause(params.filters);

      const rows = await tx.$queryRaw<BienGeoRow[]>(Prisma.sql`
        SELECT
          id, reference, nom, statut::text AS statut, type::text AS type, usage::text AS usage,
          ville, commune,
          ST_Y(geo)::float8 AS latitude,
          ST_X(geo)::float8 AS longitude,
          prix_vente_xof, loyer_mensuel_xof, score_ia,
          (archived_at IS NOT NULL) AS archived
        FROM biens
        WHERE geo IS NOT NULL
          AND archived_at IS NULL
          AND ST_Within(geo, ST_GeomFromText(${wkt}, 4326))
          ${filterClause}
        ORDER BY created_at DESC
        LIMIT ${params.limit}
      `);
      return rows;
    });
  }

  /**
   * Renvoie la liste agrégée par commune via la vue `v_biens_par_commune`.
   * La vue a security_invoker=true → la RLS est appliquée automatiquement.
   */
  async commune_stats(agence_id: string): Promise<
    Array<{
      commune: string;
      total: number;
      loues: number;
      saisonnier: number;
      disponibles: number;
      hors_circuit: number;
      loyer_moyen_xof: bigint | null;
      prix_vente_moyen_xof: bigint | null;
    }>
  > {
    return this.prisma.withTenant(agence_id, async (tx) => {
      return tx.$queryRaw<
        Array<{
          commune: string;
          total: number;
          loues: number;
          saisonnier: number;
          disponibles: number;
          hors_circuit: number;
          loyer_moyen_xof: bigint | null;
          prix_vente_moyen_xof: bigint | null;
        }>
      >(Prisma.sql`
        SELECT commune, total, loues, saisonnier, disponibles, hors_circuit,
               loyer_moyen_xof, prix_vente_moyen_xof
        FROM v_biens_par_commune
        ORDER BY total DESC
      `);
    });
  }

  private buildFilterClause(filters: SpatialFiltersRaw | undefined): Prisma.Sql {
    if (!filters) return Prisma.empty;
    const parts: Prisma.Sql[] = [];
    if (filters.statut && filters.statut.length > 0) {
      const arr = Prisma.join(filters.statut.map((s) => Prisma.sql`${s}::"BienStatut"`));
      parts.push(Prisma.sql`AND statut IN (${arr})`);
    }
    if (filters.type && filters.type.length > 0) {
      const arr = Prisma.join(filters.type.map((t) => Prisma.sql`${t}::"BienType"`));
      parts.push(Prisma.sql`AND type IN (${arr})`);
    }
    if (filters.usage && filters.usage.length > 0) {
      const arr = Prisma.join(filters.usage.map((u) => Prisma.sql`${u}::"BienUsage"`));
      parts.push(Prisma.sql`AND usage IN (${arr})`);
    }
    if (filters.prix_vente_min !== undefined) parts.push(Prisma.sql`AND prix_vente_xof >= ${filters.prix_vente_min}`);
    if (filters.prix_vente_max !== undefined) parts.push(Prisma.sql`AND prix_vente_xof <= ${filters.prix_vente_max}`);
    if (filters.loyer_min !== undefined) parts.push(Prisma.sql`AND loyer_mensuel_xof >= ${filters.loyer_min}`);
    if (filters.loyer_max !== undefined) parts.push(Prisma.sql`AND loyer_mensuel_xof <= ${filters.loyer_max}`);
    return Prisma.join(parts, ' ');
  }
}
