import type { ContactRole } from '@civora/shared-types';

export const ROLE_LABELS: Record<ContactRole, string> = {
  prospect: 'Prospect',
  locataire: 'Locataire',
  proprietaire: 'Propriétaire',
  acheteur: 'Acheteur',
  voyageur: 'Voyageur',
  partenaire: 'Partenaire',
};

export const ROLE_SHORT: Record<ContactRole, string> = {
  prospect: 'P',
  locataire: 'L',
  proprietaire: 'PR',
  acheteur: 'A',
  voyageur: 'V',
  partenaire: 'PA',
};

export const ROLE_COLORS: Record<ContactRole, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  prospect: 'info',
  locataire: 'default',
  proprietaire: 'success',
  acheteur: 'warning',
  voyageur: 'info',
  partenaire: 'default',
};

export function labelRole(r: ContactRole): string {
  return ROLE_LABELS[r] ?? r;
}
