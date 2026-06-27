import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../infrastructure/config/env.schema';
import { RedisService } from '../../../infrastructure/redis/redis.service';

interface ReverseGeocodeResult {
  commune: string | null;
  ville: string | null;
  pays: string | null;
}

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours (Mapbox tarification)
const CACHE_PREFIX = 'mapbox:reverse:';
const MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/**
 * Service de reverse-geocoding via Mapbox Geocoding API.
 *
 * Sécurité :
 *   - Token SECRET côté backend uniquement (jamais exposé au client).
 *   - Cache Redis 30 jours par couple (lat,lng) pour limiter les coûts
 *     Mapbox (tarification au "geocoding load").
 *   - Best-effort : si Mapbox ou Redis tombe, on renvoie null partout
 *     plutôt que de casser la création d'un bien.
 *
 * Précision : on demande `types=place,locality,neighborhood` pour récupérer
 * la commune (Cocody, Plateau...) en plus de la ville. En CI, le découpage
 * est : country → place (Abidjan) → neighborhood (Cocody).
 */
@Injectable()
export class ReverseGeocodingService {
  private readonly logger = new Logger(ReverseGeocodingService.name);
  private readonly token: string | undefined;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {
    this.token = this.config.get('MAPBOX_TOKEN_SECRET', { infer: true });
  }

  /**
   * Retourne commune/ville/pays pour (lat,lng).
   * Renvoie tout `null` si désactivé (pas de token) ou échec.
   */
  async reverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    const empty: ReverseGeocodeResult = { commune: null, ville: null, pays: null };
    if (!this.token) {
      this.logger.debug('MAPBOX_TOKEN_SECRET absent — reverse-geocoding désactivé');
      return empty;
    }
    const key = `${CACHE_PREFIX}${lat.toFixed(5)}:${lng.toFixed(5)}`;
    try {
      const cached = await this.redis.client.get(key);
      if (cached) return JSON.parse(cached) as ReverseGeocodeResult;
    } catch (err) {
      this.logger.warn(`Cache Redis indisponible : ${(err as Error).message}`);
    }

    const url =
      `${MAPBOX_URL}/${lng},${lat}.json` +
      `?access_token=${encodeURIComponent(this.token)}` +
      `&types=place,locality,neighborhood,district` +
      `&language=fr&limit=5`;

    let json: unknown;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox a renvoyé ${res.status}`);
        return empty;
      }
      json = await res.json();
    } catch (err) {
      this.logger.warn(`Appel Mapbox échoué : ${(err as Error).message}`);
      return empty;
    }

    const result = this.parse(json);

    try {
      await this.redis.client.set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // ignorer — le cache est best-effort
    }
    return result;
  }

  private parse(json: unknown): ReverseGeocodeResult {
    const features = (json as { features?: Array<{ place_type: string[]; text: string; context?: Array<{ id: string; text: string }> }> }).features;
    if (!Array.isArray(features) || features.length === 0) {
      return { commune: null, ville: null, pays: null };
    }
    // Mapbox renvoie les features du plus précis (neighborhood) au moins précis (country).
    let commune: string | null = null;
    let ville: string | null = null;
    let pays: string | null = null;
    for (const f of features) {
      if (!commune && (f.place_type.includes('neighborhood') || f.place_type.includes('locality') || f.place_type.includes('district'))) {
        commune = f.text;
      }
      if (!ville && f.place_type.includes('place')) {
        ville = f.text;
      }
      // contexte : parcours pour trouver le pays
      for (const ctx of f.context ?? []) {
        if (ctx.id.startsWith('country.')) pays = ctx.text;
      }
    }
    return { commune, ville, pays };
  }
}
