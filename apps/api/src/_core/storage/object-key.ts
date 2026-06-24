import { randomUUID } from 'node:crypto';

export type StorageKind =
  | 'photo_bien'
  | 'document_bien'
  | 'bail'
  | 'quittance'
  | 'releve'
  | 'piece_identite'
  | 'contrat'
  | 'rapport'
  | 'temp';

/**
 * Schéma de clé : tenants/<agence_id>/<entite_id?>/<kind>/<yyyy>/<mm>/<uuid>.<ext>
 *
 * Exemples :
 *   tenants/abc.../baux/2025/06/uuid.pdf
 *   tenants/abc.../ent-xyz/photo_bien/2025/06/uuid.jpg
 */
export function buildObjectKey(params: {
  agence_id: string;
  entite_id?: string | null;
  kind: StorageKind;
  ext: string;
  now?: Date;
}): string {
  const { agence_id, entite_id, kind, ext, now = new Date() } = params;

  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = randomUUID();
  const cleanExt = ext.replace(/^\./, '').toLowerCase();

  const parts = ['tenants', agence_id];
  if (entite_id) parts.push(entite_id);
  parts.push(kind, yyyy, mm, `${id}.${cleanExt}`);

  return parts.join('/');
}

/**
 * Vérifie qu'une clé appartient à l'agence donnée.
 * La clé doit commencer par "tenants/<agence_id>/".
 */
export function keyBelongsToAgence(key: string, agence_id: string): boolean {
  return key.startsWith(`tenants/${agence_id}/`);
}
