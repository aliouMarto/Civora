import type { BienStatut, BienType, BienUsage } from '@civora/shared-types';

export const STATUT_LABELS: Record<BienStatut, string> = {
  disponible: 'Disponible',
  loue: 'Loué',
  saisonnier: 'Saisonnier',
  hors_circuit: 'Hors circuit',
};

export const STATUT_COLORS: Record<BienStatut, string> = {
  disponible: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  loue: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  saisonnier: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  hors_circuit: 'bg-neutral-200 text-neutral-700 ring-1 ring-neutral-300',
};

export const STATUT_DOT_COLORS: Record<BienStatut, string> = {
  disponible: '#10b981',
  loue: '#3b82f6',
  saisonnier: '#f97316',
  hors_circuit: '#6b7280',
};

export const TYPE_LABELS: Record<BienType, string> = {
  villa: 'Villa',
  appartement: 'Appartement',
  studio: 'Studio',
  bureau: 'Bureau',
  local_commercial: 'Local commercial',
  terrain: 'Terrain',
  immeuble: 'Immeuble',
  autre: 'Autre',
};

export const USAGE_LABELS: Record<BienUsage, string> = {
  vente: 'Vente',
  location_longue_duree: 'Location longue durée',
  saisonnier: 'Saisonnier',
  mixte: 'Mixte',
};

export const AMENITY_LABELS: Record<string, string> = {
  piscine: 'Piscine',
  climatisation: 'Climatisation',
  jardin: 'Jardin',
  parking: 'Parking',
  meuble: 'Meublé',
  ascenseur: 'Ascenseur',
  vue_mer: 'Vue mer',
  vue_lagune: 'Vue lagune',
  fibre: 'Fibre',
  wifi: 'WiFi',
  salle_reunion: 'Salle de réunion',
  garage: 'Garage',
};

export function labelAmenity(code: string): string {
  return AMENITY_LABELS[code] ?? code.replace(/_/g, ' ');
}
