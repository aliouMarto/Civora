import { z } from 'zod';

// ─── Enums fermées ─────────────────────────────────────────────────────────

export const BIEN_STATUTS = ['disponible', 'loue', 'saisonnier', 'hors_circuit'] as const;
export type BienStatut = (typeof BIEN_STATUTS)[number];

export const BIEN_TYPES = [
  'villa',
  'appartement',
  'studio',
  'bureau',
  'local_commercial',
  'terrain',
  'immeuble',
  'autre',
] as const;
export type BienType = (typeof BIEN_TYPES)[number];

export const BIEN_USAGES = [
  'vente',
  'location_longue_duree',
  'saisonnier',
  'mixte',
] as const;
export type BienUsage = (typeof BIEN_USAGES)[number];

export const BIEN_STATUT_SOURCES = ['manuel', 'bail', 'reservation'] as const;
export type BienStatutSource = (typeof BIEN_STATUT_SOURCES)[number];

export const BIEN_HISTORIQUE_TYPES = [
  'bail',
  'reservation',
  'vente',
  'travaux',
  'changement_proprietaire',
] as const;
export type BienHistoriqueType = (typeof BIEN_HISTORIQUE_TYPES)[number];

export const BIEN_SORTS = [
  'created_desc',
  'prix_asc',
  'prix_desc',
  'score_desc',
  'surface_desc',
] as const;
export type BienSort = (typeof BIEN_SORTS)[number];

// ─── Validations communes ──────────────────────────────────────────────────

const Iso2Schema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Code pays ISO 3166-1 alpha-2 en majuscules');

const LatSchema = z.number().gte(-90).lte(90);
const LngSchema = z.number().gte(-180).lte(180);

const BigIntCentsSchema = z
  .union([
    z.bigint(),
    z.number().int().nonnegative(),
    z
      .string()
      .regex(/^\d+$/)
      .transform((s) => BigInt(s)),
  ])
  .transform((v) => (typeof v === 'bigint' ? v : BigInt(v as number)));

// ─── Création / mise à jour ────────────────────────────────────────────────

export const CreateBienSchema = z
  .object({
    reference: z.string().max(40).optional(), // auto-générée si absente
    nom: z.string().trim().min(1).max(180),
    description: z.string().max(5000).optional(),

    type: z.enum(BIEN_TYPES),
    usage: z.enum(BIEN_USAGES).default('location_longue_duree'),
    statut: z.enum(BIEN_STATUTS).default('disponible'),

    surface: z.number().positive().max(100_000).optional(),
    pieces: z.number().int().nonnegative().max(50).optional(),
    chambres: z.number().int().nonnegative().max(50).optional(),
    salles_bain: z.number().int().nonnegative().max(50).optional(),
    etage: z.number().int().min(-5).max(150).optional(),
    annee_construction: z.number().int().min(1800).max(new Date().getFullYear() + 5).optional(),
    amenities: z.array(z.string().min(1).max(40)).max(40).default([]),

    adresse_ligne1: z.string().trim().min(1).max(255),
    adresse_ligne2: z.string().max(255).optional(),
    ville: z.string().trim().min(1).max(120),
    commune: z.string().max(120).optional(),
    pays: Iso2Schema.default('CI'),
    latitude: LatSchema.optional(),
    longitude: LngSchema.optional(),

    prix_vente_xof: BigIntCentsSchema.optional(),
    loyer_mensuel_xof: BigIntCentsSchema.optional(),
    charges_xof: BigIntCentsSchema.optional(),
    caution_xof: BigIntCentsSchema.optional(),

    proprietaire_id: z.string().uuid().optional(),
    agent_responsable_id: z.string().uuid().optional(),
    entite_id: z.string().uuid().optional(),
    tags: z.array(z.string().min(1).max(40)).max(40).default([]),
  })
  .refine(
    (d) => !(d.usage === 'vente' || d.usage === 'mixte') || d.prix_vente_xof !== undefined,
    { message: 'prix_vente_xof est requis quand usage in [vente, mixte]', path: ['prix_vente_xof'] },
  )
  .refine(
    (d) =>
      !(d.usage === 'location_longue_duree' || d.usage === 'mixte') ||
      d.loyer_mensuel_xof !== undefined,
    { message: 'loyer_mensuel_xof est requis quand usage in [location_longue_duree, mixte]', path: ['loyer_mensuel_xof'] },
  )
  .refine(
    (d) => (d.latitude === undefined) === (d.longitude === undefined),
    { message: 'latitude et longitude doivent être fournies ensemble', path: ['latitude'] },
  );
export type CreateBienInput = z.infer<typeof CreateBienSchema>;

// Update : tous les champs optionnels, agence_id et reference interdits côté API.
export const UpdateBienSchema = CreateBienSchema.partial().omit({});
export type UpdateBienInput = z.infer<typeof UpdateBienSchema>;

// ─── Liste / filtres ───────────────────────────────────────────────────────

const csvToArray = (val: unknown): unknown =>
  typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : val;

export const ListBiensQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().min(1).max(100).optional(),
  statut: z.preprocess(csvToArray, z.array(z.enum(BIEN_STATUTS))).optional(),
  type: z.preprocess(csvToArray, z.array(z.enum(BIEN_TYPES))).optional(),
  usage: z.preprocess(csvToArray, z.array(z.enum(BIEN_USAGES))).optional(),
  ville: z.preprocess(csvToArray, z.array(z.string())).optional(),
  commune: z.preprocess(csvToArray, z.array(z.string())).optional(),
  proprietaire_id: z.string().uuid().optional(),
  agent_responsable_id: z.string().uuid().optional(),
  prix_vente_min: z.coerce.bigint().nonnegative().optional(),
  prix_vente_max: z.coerce.bigint().nonnegative().optional(),
  loyer_min: z.coerce.bigint().nonnegative().optional(),
  loyer_max: z.coerce.bigint().nonnegative().optional(),
  surface_min: z.coerce.number().positive().optional(),
  surface_max: z.coerce.number().positive().optional(),
  chambres_min: z.coerce.number().int().nonnegative().optional(),
  amenities: z.preprocess(csvToArray, z.array(z.string())).optional(),
  tags: z.preprocess(csvToArray, z.array(z.string())).optional(),
  score_min: z.coerce.number().int().min(0).max(100).optional(),
  score_max: z.coerce.number().int().min(0).max(100).optional(),
  include_archived: z.coerce.boolean().default(false),
  sort: z.enum(BIEN_SORTS).default('created_desc'),
});
export type ListBiensQuery = z.infer<typeof ListBiensQuerySchema>;

// ─── Recherche spatiale ────────────────────────────────────────────────────

export const SpatialFiltersSchema = z.object({
  statut: z.array(z.enum(BIEN_STATUTS)).optional(),
  type: z.array(z.enum(BIEN_TYPES)).optional(),
  usage: z.array(z.enum(BIEN_USAGES)).optional(),
  prix_vente_min: z.bigint().nonnegative().optional(),
  prix_vente_max: z.bigint().nonnegative().optional(),
  loyer_min: z.bigint().nonnegative().optional(),
  loyer_max: z.bigint().nonnegative().optional(),
});
export type SpatialFilters = z.infer<typeof SpatialFiltersSchema>;

export const SpatialSearchSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('radius'),
    center: z.object({ lat: LatSchema, lng: LngSchema }),
    radius_meters: z.number().int().positive().max(100_000),
    filters: SpatialFiltersSchema.optional(),
  }),
  z.object({
    mode: z.literal('bbox'),
    bbox: z
      .tuple([LngSchema, LatSchema, LngSchema, LatSchema])
      .refine(([minLng, minLat, maxLng, maxLat]) => minLng < maxLng && minLat < maxLat, {
        message: 'bbox doit être [minLng, minLat, maxLng, maxLat] avec min < max',
      }),
    filters: SpatialFiltersSchema.optional(),
  }),
  z.object({
    mode: z.literal('polygon'),
    polygon: z
      .array(z.tuple([LngSchema, LatSchema]))
      .min(3, 'polygon nécessite au moins 3 points'),
    filters: SpatialFiltersSchema.optional(),
  }),
]);
export type SpatialSearchInput = z.infer<typeof SpatialSearchSchema>;

// ─── GeoJSON output ────────────────────────────────────────────────────────

export interface BienGeoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  properties: {
    id: string;
    nom: string;
    reference: string;
    statut: BienStatut;
    type: BienType;
    usage: BienUsage;
    ville: string;
    commune: string | null;
    prix_vente_xof: string | null;       // BigInt → string pour JSON-safety
    loyer_mensuel_xof: string | null;
    score_ia: number | null;
    archived: boolean;
  };
}

export interface BienFeatureCollection {
  type: 'FeatureCollection';
  features: BienGeoFeature[];
  /** Si > limit côté serveur, indique que le résultat a été tronqué */
  truncated: boolean;
}

// ─── Photo upload ──────────────────────────────────────────────────────────

export const UploadPhotoSchema = z.object({
  ext: z.string().regex(/^(jpg|jpeg|png|webp|heic)$/i),
  contentType: z.string().min(1).max(80),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).optional(), // 20 Mo max
  caption: z.string().max(255).optional(),
});
export type UploadPhotoInput = z.infer<typeof UploadPhotoSchema>;

export const RegisterPhotoSchema = z.object({
  storage_key: z.string().min(1).max(500),
  caption: z.string().max(255).optional(),
  ordre: z.number().int().nonnegative().max(1000).optional(),
});
export type RegisterPhotoInput = z.infer<typeof RegisterPhotoSchema>;

export const ReorderPhotosSchema = z.object({
  order: z.array(z.object({ id: z.string().uuid(), ordre: z.number().int().nonnegative() })).min(1).max(50),
});
export type ReorderPhotosInput = z.infer<typeof ReorderPhotosSchema>;

// ─── DTOs de sortie ────────────────────────────────────────────────────────

export interface BienDto {
  id: string;
  agence_id: string;
  reference: string;
  nom: string;
  description: string | null;
  type: BienType;
  usage: BienUsage;
  statut: BienStatut;
  statut_source: BienStatutSource;

  surface: string | null;       // Decimal → string
  pieces: number | null;
  chambres: number | null;
  salles_bain: number | null;
  etage: number | null;
  annee_construction: number | null;
  amenities: string[];

  adresse_ligne1: string;
  adresse_ligne2: string | null;
  ville: string;
  commune: string | null;
  pays: string;
  latitude: number | null;
  longitude: number | null;

  prix_vente_xof: string | null;
  loyer_mensuel_xof: string | null;
  charges_xof: string | null;
  caution_xof: string | null;

  yield_brut_pct: string | null;
  yield_updated_at: string | null;

  proprietaire_id: string | null;
  agent_responsable_id: string | null;
  entite_id: string | null;
  tags: string[];

  score_ia: number | null;
  score_occupation: string | null;
  score_rentabilite: string | null;
  score_diversification: string | null;
  score_risque_impaye: string | null;
  score_updated_at: string | null;

  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface BienPhotoDto {
  id: string;
  storage_key: string;       // pour debug — l'URL signée arrive séparément
  caption: string | null;
  ordre: number;
  url?: string;              // URL signée GET (TTL court)
  url_expires_at?: string;
  created_at: string;
}

export interface BienHistoriqueDto {
  id: string;
  type: BienHistoriqueType;
  reference_id: string | null;
  debut: string | null;
  fin: string | null;
  montant_xof: string | null;
  notes: string | null;
  created_at: string;
}

export interface BienCommuneStat {
  commune: string;
  total: number;
  loues: number;
  saisonnier: number;
  disponibles: number;
  hors_circuit: number;
  loyer_moyen_xof: string | null;
  prix_vente_moyen_xof: string | null;
}

export interface BienRepartitionStat {
  par_statut: Record<BienStatut, number>;
  par_type: Record<BienType, number>;
  par_usage: Record<BienUsage, number>;
}

export interface BienPortefeuilleStat {
  total_biens: number;
  valeur_patrimoniale_xof: string;          // somme prix_vente
  mrr_theorique_xof: string;                // somme loyer_mensuel des disponibles+loués
  taux_occupation_pct: number;              // 0–100
}
