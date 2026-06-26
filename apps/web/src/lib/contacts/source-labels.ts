import type { ContactSource } from '@civora/shared-types';

export const SOURCE_LABELS: Record<ContactSource, string> = {
  portail: 'Portail (annonce tierce)',
  reseau: 'Réseau (référé pro)',
  walk_in: 'Walk-in',
  referencement: 'Référencement client',
  site_web: 'Site web',
  import: 'Import en masse',
  autre: 'Autre',
};

export function labelSource(s: ContactSource | null | undefined): string {
  if (!s) return 'Non renseignée';
  return SOURCE_LABELS[s] ?? s;
}
