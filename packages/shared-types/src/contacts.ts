import { z } from 'zod';

// ─── Enums fermées ─────────────────────────────────────────────────────────

export const CONTACT_ROLES = [
  'prospect',
  'locataire',
  'proprietaire',
  'acheteur',
  'voyageur',
  'partenaire',
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_SOURCES = [
  'portail',
  'reseau',
  'walk_in',
  'referencement',
  'site_web',
  'import',
  'autre',
] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const CONTACT_GENRES = ['M', 'F', 'AUTRE'] as const;
export type ContactGenre = (typeof CONTACT_GENRES)[number];

export const CONTACT_LANGUES = ['fr', 'en'] as const;
export type ContactLangue = (typeof CONTACT_LANGUES)[number];

export const CONTACT_SCORE_CATEGORIES = ['froid', 'tiede', 'chaud'] as const;
export type ContactScoreCategorie = (typeof CONTACT_SCORE_CATEGORIES)[number];

export const INTERACTION_TYPES = [
  'email',
  'whatsapp',
  'sms',
  'appel',
  'visite',
  'note',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_DIRECTIONS = ['sortant', 'entrant'] as const;
export type InteractionDirection = (typeof INTERACTION_DIRECTIONS)[number];

export const MERGE_STRATEGIES = ['keep_master', 'prefer_source', 'most_recent'] as const;
export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

export const CONTACT_SORTS = [
  'created_at_desc',
  'nom_asc',
  'score_desc',
  'derniere_interaction_desc',
] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

// ─── Validations communes ──────────────────────────────────────────────────

// E.164 strict : + suivi de 8 à 15 chiffres. Pour la Côte d'Ivoire : +225 + 10 chiffres.
export const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Téléphone invalide (format E.164 attendu, ex: +2250707070707)');

const Iso2Schema = z
  .string()
  .length(2, 'Code pays ISO 3166-1 alpha-2 (2 lettres)')
  .regex(/^[A-Z]{2}$/, 'Code pays en majuscules');

// ─── Schémas Contact ───────────────────────────────────────────────────────

// Objet de base — réutilisé par Create (avec refine) et Update (partial).
// .refine() retourne un ZodEffects qui n'expose pas .partial() : on garde donc
// la version "brute" à part.
const ContactBaseSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  prenom: z.string().trim().min(1).max(120).optional(),
  genre: z.enum(CONTACT_GENRES).optional(),
  langue: z.enum(CONTACT_LANGUES).default('fr'),
  email: z.string().email().toLowerCase().optional(),
  telephone: E164Schema.optional(),
  whatsapp: E164Schema.optional(),
  whatsapp_opt_in: z.boolean().default(false),
  adresse_ligne1: z.string().max(255).optional(),
  adresse_ligne2: z.string().max(255).optional(),
  ville: z.string().max(120).optional(),
  commune: z.string().max(120).optional(),
  pays: Iso2Schema.default('CI'),
  roles: z.array(z.enum(CONTACT_ROLES)).default([]),
  source: z.enum(CONTACT_SOURCES).optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).default([]),
});

export const CreateContactSchema = ContactBaseSchema.refine(
  (d) => Boolean(d.email) || Boolean(d.telephone),
  {
    message: 'Au moins un canal requis : email ou telephone',
    path: ['email'],
  },
);
export type CreateContactInput = z.infer<typeof CreateContactSchema>;

// Update : tous les champs optionnels. L'invariant "au moins un canal" est
// re-vérifié côté service après merge avec le contact existant.
export const UpdateContactSchema = ContactBaseSchema.partial();
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const CheckDuplicatesSchema = z
  .object({
    email: z.string().email().toLowerCase().optional(),
    telephone: E164Schema.optional(),
    nom: z.string().trim().min(1).optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.telephone) || Boolean(d.nom), {
    message: 'Au moins un critère requis (email, telephone ou nom)',
  });
export type CheckDuplicatesInput = z.infer<typeof CheckDuplicatesSchema>;

export const MergeContactsSchema = z
  .object({
    master_id: z.string().uuid(),
    source_ids: z.array(z.string().uuid()).min(1).max(20),
    strategy: z.enum(MERGE_STRATEGIES).default('keep_master'),
  })
  .refine((d) => !d.source_ids.includes(d.master_id), {
    message: 'master_id ne peut pas être dans source_ids',
    path: ['source_ids'],
  });
export type MergeContactsInput = z.infer<typeof MergeContactsSchema>;

// ─── Schémas Interaction ───────────────────────────────────────────────────

export const CreateInteractionSchema = z
  .object({
    type: z.enum(INTERACTION_TYPES),
    direction: z.enum(INTERACTION_DIRECTIONS).optional(),
    sujet: z.string().max(255).optional(),
    contenu: z.string().max(10000).optional(),
    metadata: z.record(z.unknown()).default({}),
    occurred_at: z.coerce.date().optional(),
  })
  .refine((d) => d.type === 'note' || d.direction !== undefined, {
    message: 'direction obligatoire sauf pour type "note"',
    path: ['direction'],
  });
export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>;

// ─── Schémas Segment ───────────────────────────────────────────────────────

// DSL des filtres : structure minimaliste, étendue dans les itérations futures.
export const SegmentFiltresSchema = z.object({
  roles: z.array(z.enum(CONTACT_ROLES)).optional(),
  tags: z.array(z.string()).optional(),
  segments_ia: z.array(z.string()).optional(),
  ville: z.string().optional(),
  commune: z.string().optional(),
  pays: Iso2Schema.optional(),
  source: z.enum(CONTACT_SOURCES).optional(),
  score_min: z.number().int().min(0).max(100).optional(),
  score_max: z.number().int().min(0).max(100).optional(),
  score_categorie: z.enum(CONTACT_SCORE_CATEGORIES).optional(),
  whatsapp_opt_in: z.boolean().optional(),
});
export type SegmentFiltres = z.infer<typeof SegmentFiltresSchema>;

export const CreateSegmentSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  filtres: SegmentFiltresSchema,
});
export type CreateSegmentInput = z.infer<typeof CreateSegmentSchema>;

// ─── Schéma liste / filtres ────────────────────────────────────────────────

const csvToArray = (val: unknown): unknown =>
  typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : val;

export const ListContactsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().min(1).max(100).optional(),
  role: z.preprocess(csvToArray, z.array(z.enum(CONTACT_ROLES))).optional(),
  ville: z.string().max(120).optional(),
  commune: z.string().max(120).optional(),
  pays: Iso2Schema.optional(),
  source: z.enum(CONTACT_SOURCES).optional(),
  tags: z.preprocess(csvToArray, z.array(z.string())).optional(),
  segments_ia: z.preprocess(csvToArray, z.array(z.string())).optional(),
  score_min: z.coerce.number().int().min(0).max(100).optional(),
  score_max: z.coerce.number().int().min(0).max(100).optional(),
  score_categorie: z.enum(CONTACT_SCORE_CATEGORIES).optional(),
  whatsapp_opt_in: z.coerce.boolean().optional(),
  created_after: z.coerce.date().optional(),
  created_before: z.coerce.date().optional(),
  include_archived: z.coerce.boolean().default(false),
  sort: z.enum(CONTACT_SORTS).default('created_at_desc'),
});
export type ListContactsQuery = z.infer<typeof ListContactsQuerySchema>;

// ─── DTOs de sortie (lecture) ──────────────────────────────────────────────

export interface ContactDto {
  id: string;
  agence_id: string;
  nom: string;
  prenom: string | null;
  genre: ContactGenre | null;
  langue: ContactLangue;
  email: string | null;
  telephone: string | null;
  whatsapp: string | null;
  whatsapp_opt_in: boolean;
  adresse_ligne1: string | null;
  adresse_ligne2: string | null;
  ville: string | null;
  commune: string | null;
  pays: string;
  roles: ContactRole[];
  source: ContactSource | null;
  tags: string[];
  segments_ia: string[];
  score_ia: number | null;
  score_categorie: ContactScoreCategorie | null;
  score_updated_at: string | null;
  derniere_interaction_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionDto {
  id: string;
  contact_id: string;
  type: InteractionType;
  direction: InteractionDirection | null;
  sujet: string | null;
  contenu: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export interface SegmentDto {
  id: string;
  nom: string;
  description: string | null;
  filtres: SegmentFiltres;
  systeme: boolean;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCandidate {
  contact: ContactDto;
  matched_on: ('email' | 'telephone' | 'nom_similaire')[];
  similarity?: number;
}
