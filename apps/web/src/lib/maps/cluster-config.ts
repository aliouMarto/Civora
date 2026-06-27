import type { FilterSpecification } from 'mapbox-gl';

/**
 * Configuration des clusters Mapbox pour le module Biens.
 *
 * Couleurs/seuils :
 *   < 10   : vert
 *   10-50  : jaune
 *   50-100 : orange
 *   100+   : rouge
 */
export const CLUSTER_PROPERTIES = {
  cluster: true,
  clusterMaxZoom: 14,
  clusterRadius: 50,
} as const;

export const CLUSTER_LAYER_PAINT = {
  'circle-color': [
    'step',
    ['get', 'point_count'],
    '#10b981', // emerald — < 10
    10, '#facc15', // jaune
    50, '#f97316', // orange
    100, '#ef4444', // rouge
  ] as unknown as mapboxgl.ExpressionSpecification,
  'circle-radius': [
    'step',
    ['get', 'point_count'],
    18,
    10, 24,
    50, 32,
    100, 42,
  ] as unknown as mapboxgl.ExpressionSpecification,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 2,
};

export const CLUSTER_COUNT_LAYOUT = {
  'text-field': '{point_count_abbreviated}',
  'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  'text-size': 13,
};

export const UNCLUSTERED_FILTER: FilterSpecification = ['!', ['has', 'point_count']];
export const CLUSTER_FILTER: FilterSpecification = ['has', 'point_count'];

/** Couleur du marker individuel selon `statut` (utilisé dans circle-color). */
export const STATUT_COLOR_EXPRESSION = [
  'match',
  ['get', 'statut'],
  'disponible', '#10b981',
  'loue', '#3b82f6',
  'saisonnier', '#f97316',
  'hors_circuit', '#6b7280',
  '#6b7280',
] as unknown as mapboxgl.ExpressionSpecification;

// Type ré-exporté pour éviter une déclaration globale dans cluster-config.
// `mapboxgl.ExpressionSpecification` n'est utilisé que comme type cible.
declare global {
  namespace mapboxgl {
    type ExpressionSpecification = unknown;
  }
}
