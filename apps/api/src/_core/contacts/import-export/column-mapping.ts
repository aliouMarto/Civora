/**
 * Détection heuristique du mapping de colonnes à l'import.
 *
 * Donnée : la liste des en-têtes du fichier source + un échantillon de
 * quelques lignes. Retour : pour chaque champ DTO connu, le nom de colonne
 * source suggéré (ou null si rien de pertinent).
 *
 * L'utilisateur peut toujours corriger ce mapping côté UI (étape 2 du wizard).
 */

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Champs DTO disponibles côté import contacts. */
export const SUPPORTED_FIELDS = [
  'nom',
  'prenom',
  'genre',
  'langue',
  'email',
  'telephone',
  'whatsapp',
  'whatsapp_opt_in',
  'adresse_ligne1',
  'adresse_ligne2',
  'ville',
  'commune',
  'pays',
  'roles',
  'source',
  'tags',
] as const;
export type SupportedField = (typeof SUPPORTED_FIELDS)[number];

/** Dictionnaire de synonymes courants (français + anglais). */
const SYNONYMS: Record<SupportedField, string[]> = {
  nom: ['nom', 'lastname', 'last_name', 'surname', 'nomdefamille', 'famille'],
  prenom: ['prenom', 'firstname', 'first_name', 'givenname'],
  genre: ['genre', 'sexe', 'gender', 'sex'],
  langue: ['langue', 'language', 'lang', 'locale'],
  email: ['email', 'mail', 'courriel', 'emailaddress'],
  telephone: ['telephone', 'tel', 'phone', 'mobile', 'gsm', 'portable', 'numero'],
  whatsapp: ['whatsapp', 'wa', 'wanumber'],
  whatsapp_opt_in: ['whatsappoptin', 'optin', 'consent_whatsapp', 'consentement'],
  adresse_ligne1: ['adresse', 'address', 'addr', 'street', 'rue', 'adresseligne1'],
  adresse_ligne2: ['adresse2', 'address2', 'complement', 'adresseligne2'],
  ville: ['ville', 'city', 'localite'],
  commune: ['commune', 'quartier', 'district'],
  pays: ['pays', 'country', 'countrycode'],
  roles: ['roles', 'role', 'type', 'categorie', 'category'],
  source: ['source', 'origine', 'channel', 'canal'],
  tags: ['tags', 'motscles', 'keywords', 'mots_cles'],
};

/** Normalise une chaîne pour comparaison : lower + sans accents + sans non-alphanum. */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export interface MappingSuggestion {
  /** Mapping suggéré : champ DTO → nom de colonne d'origine */
  mapping: Partial<Record<SupportedField, string>>;
  /** Colonnes source qui n'ont matché aucun champ */
  unmatched: string[];
}

/**
 * Suggère un mapping.
 *
 * 1. Compare les en-têtes normalisés au dictionnaire de synonymes.
 * 2. Si plusieurs en-têtes matchent un même champ : prend le premier.
 * 3. Si aucune correspondance par nom : essaie une heuristique sur l'échantillon
 *    (présence de `+...` → telephone ; présence d'`@` → email ; etc.).
 */
export function suggestMapping(
  headers: string[],
  sampleRows: Array<Record<string, string>> = [],
): MappingSuggestion {
  const mapping: Partial<Record<SupportedField, string>> = {};
  const remaining = new Set(headers);

  // 1) Match par dictionnaire
  for (const field of SUPPORTED_FIELDS) {
    const synonyms = SYNONYMS[field].map(normalizeHeader);
    for (const header of headers) {
      if (!remaining.has(header)) continue;
      if (synonyms.includes(normalizeHeader(header))) {
        mapping[field] = header;
        remaining.delete(header);
        break;
      }
    }
  }

  // 2) Match heuristique sur l'échantillon — uniquement pour les champs
  //    canaux (email/telephone) qui sont les plus critiques.
  if (!mapping.email) {
    for (const header of remaining) {
      const nonEmpty = sampleRows.map((r) => r[header]).filter((v): v is string => Boolean(v));
      if (nonEmpty.length > 0 && nonEmpty.every((v) => EMAIL.test(v.trim()))) {
        mapping.email = header;
        remaining.delete(header);
        break;
      }
    }
  }
  if (!mapping.telephone) {
    for (const header of remaining) {
      const nonEmpty = sampleRows.map((r) => r[header]).filter((v): v is string => Boolean(v));
      if (
        nonEmpty.length > 0 &&
        nonEmpty.every((v) => E164.test(v.trim().replace(/\s+/g, '')))
      ) {
        mapping.telephone = header;
        remaining.delete(header);
        break;
      }
    }
  }

  return {
    mapping,
    unmatched: [...remaining],
  };
}

/**
 * Inverse le mapping : nom de colonne source → champ DTO.
 * Pratique pour transformer ligne par ligne lors de l'import.
 */
export function inverseMapping(
  mapping: Partial<Record<SupportedField, string>>,
): Map<string, SupportedField> {
  const inverse = new Map<string, SupportedField>();
  for (const [field, header] of Object.entries(mapping) as Array<[SupportedField, string]>) {
    if (header) inverse.set(header, field);
  }
  return inverse;
}

/**
 * Transforme une ligne brute (clé = nom de colonne d'origine) en DTO partiel
 * (clé = champ supporté). Les valeurs vides deviennent `undefined` pour ne
 * pas pousser des chaînes vides à class-validator.
 *
 * - `roles` et `tags` : si la cellule contient des virgules ou point-virgules,
 *   split automatiquement en tableau.
 * - `whatsapp_opt_in` : reconnaît `true/false`, `1/0`, `oui/non`, `yes/no`.
 */
export function mapRowToDto(
  row: Record<string, string>,
  inverse: Map<string, SupportedField>,
): Record<string, unknown> {
  const dto: Record<string, unknown> = {};
  for (const [sourceKey, field] of inverse) {
    const raw = row[sourceKey];
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (trimmed === '') continue;

    if (field === 'roles' || field === 'tags') {
      const parts = trimmed
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      dto[field] = parts;
    } else if (field === 'whatsapp_opt_in') {
      const v = trimmed.toLowerCase();
      dto[field] = ['true', '1', 'oui', 'yes', 'o', 'y'].includes(v);
    } else if (field === 'pays') {
      dto[field] = trimmed.toUpperCase().slice(0, 2);
    } else if (field === 'email') {
      dto[field] = trimmed.toLowerCase();
    } else {
      dto[field] = trimmed;
    }
  }
  return dto;
}
