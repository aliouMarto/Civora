'use client';

import mapboxgl from 'mapbox-gl';

/**
 * Initialise le token Mapbox public (chargé depuis NEXT_PUBLIC_MAPBOX_TOKEN).
 * Doit être appelé une seule fois au montage du premier composant qui utilise
 * Mapbox. Idempotent : appels multiples sans effet.
 *
 * Le token public est scopé "pk.*" (lecture seule, restreint au domaine).
 * Le token secret "sk.*" reste côté backend pour la Geocoding API.
 */
let initialized = false;

export function initMapbox(): void {
  if (initialized) return;
  const token = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'];
  if (!token) {
    // eslint-disable-next-line no-console
    console.warn('NEXT_PUBLIC_MAPBOX_TOKEN absent — la carte ne pourra pas se charger.');
    return;
  }
  mapboxgl.accessToken = token;
  initialized = true;
}

export const DEFAULT_MAP_CENTER: [number, number] = [-4.024, 5.345]; // Abidjan (lng, lat)
export const DEFAULT_MAP_ZOOM = 11;
export const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

/** Bbox de viewport actuel formaté en chaîne pour l'API `/biens/map`. */
export function viewportBbox(map: mapboxgl.Map): string {
  const b = map.getBounds();
  if (!b) return '';
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
}

export { mapboxgl };
