// Catalogue exhaustif des permissions Civora.
// Toute permission inconnue déclenche une erreur TypeScript.
// Format : '<module>:<action>'

const MODULES = [
  'biens',
  'crm',
  'locations',
  'saisonnier',
  'ventes',
  'compta',
  'ged',
  'workflows',
  'rapports',
  'calendrier',
  'equipe',
  'parametres',
  'portail',
  'ia',
  'command',
] as const;

const ACTIONS = ['read', 'write', 'delete', 'export', 'admin'] as const;

type Module = (typeof MODULES)[number];
type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}:${Action}` | '*:*';

// Vérifie qu'une string est une permission valide au runtime
export function isPermission(value: string): value is Permission {
  if (value === '*:*') return true;
  const [mod, action] = value.split(':');
  return (
    MODULES.includes(mod as Module) &&
    ACTIONS.includes(action as Action)
  );
}

// Vérifie qu'un utilisateur possède une permission donnée
// (supporte le wildcard Admin '*:*')
export function hasPermission(
  userPermissions: string[],
  required: Permission,
): boolean {
  if (userPermissions.includes('*:*')) return true;
  return userPermissions.includes(required);
}
