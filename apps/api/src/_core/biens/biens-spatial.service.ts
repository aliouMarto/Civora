import { BadRequestException, Injectable } from '@nestjs/common';

import { TenantContextService } from '../tenancy/tenant-context.service';

import { BiensGeoRepository, type BienGeoRow } from './repositories/biens-geo.repository';
import type { SearchSpatialDto } from './dto/search-spatial.dto';
import type { BienFeatureCollection, BienGeoFeature } from '@civora/shared-types';

const GEOJSON_MAX_FEATURES = 5000;
const SPATIAL_SEARCH_LIMIT = 1000;

@Injectable()
export class BiensSpatialService {
  constructor(
    private readonly tenantCtx: TenantContextService,
    private readonly geoRepo: BiensGeoRepository,
  ) {}

  /**
   * Recherche spatiale (radius / bbox / polygon).
   * Le mode discrimine la branche du repository à appeler.
   */
  async search(dto: SearchSpatialDto): Promise<BienGeoRow[]> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const filters = dto.filters
      ? {
          statut: dto.filters.statut,
          type: dto.filters.type,
          usage: dto.filters.usage,
        }
      : undefined;

    if (dto.mode === 'radius') {
      if (!dto.center || dto.radius_meters === undefined) {
        throw new BadRequestException('mode=radius requiert `center` et `radius_meters`');
      }
      return this.geoRepo.searchRadius({
        agence_id,
        center: dto.center,
        radius_meters: dto.radius_meters,
        filters,
        limit: SPATIAL_SEARCH_LIMIT,
      });
    }
    if (dto.mode === 'bbox') {
      if (!dto.bbox) throw new BadRequestException('mode=bbox requiert `bbox`');
      const [minLng, minLat, maxLng, maxLat] = dto.bbox;
      if (minLng >= maxLng || minLat >= maxLat) {
        throw new BadRequestException('bbox doit être [minLng, minLat, maxLng, maxLat] avec min < max');
      }
      return this.geoRepo.searchBbox({
        agence_id,
        bbox: [minLng, minLat, maxLng, maxLat],
        filters,
        limit: SPATIAL_SEARCH_LIMIT,
      });
    }
    if (dto.mode === 'polygon') {
      if (!dto.polygon || dto.polygon.length < 3) {
        throw new BadRequestException('mode=polygon requiert au moins 3 points');
      }
      return this.geoRepo.searchPolygon({
        agence_id,
        polygon: dto.polygon,
        filters,
        limit: SPATIAL_SEARCH_LIMIT,
      });
    }
    throw new BadRequestException(`Mode spatial inconnu : ${(dto as { mode: string }).mode}`);
  }

  /**
   * Renvoie un GeoJSON FeatureCollection pour la carte.
   * Bbox obligatoire pour éviter de rapatrier le parc entier.
   * Tronque à 5000 features (au-delà, l'UI doit zoomer).
   */
  async mapGeoJson(bbox: [number, number, number, number]): Promise<BienFeatureCollection> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const rows = await this.geoRepo.searchBbox({
      agence_id,
      bbox,
      limit: GEOJSON_MAX_FEATURES + 1,
    });
    const truncated = rows.length > GEOJSON_MAX_FEATURES;
    const visible = truncated ? rows.slice(0, GEOJSON_MAX_FEATURES) : rows;
    const features: BienGeoFeature[] = visible.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        id: r.id,
        nom: r.nom,
        reference: r.reference,
        statut: r.statut as BienGeoFeature['properties']['statut'],
        type: r.type as BienGeoFeature['properties']['type'],
        usage: r.usage as BienGeoFeature['properties']['usage'],
        ville: r.ville,
        commune: r.commune,
        prix_vente_xof: r.prix_vente_xof !== null ? String(r.prix_vente_xof) : null,
        loyer_mensuel_xof: r.loyer_mensuel_xof !== null ? String(r.loyer_mensuel_xof) : null,
        score_ia: r.score_ia,
        archived: r.archived,
      },
    }));
    return { type: 'FeatureCollection', features, truncated };
  }

  /** Liste agrégée par commune (vue v_biens_par_commune). */
  async communeStats() {
    const agence_id = this.tenantCtx.requireAgenceId();
    return this.geoRepo.commune_stats(agence_id);
  }
}
