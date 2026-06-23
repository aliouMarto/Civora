// Civora shared types — enrichis au fil des étapes

/**
 * Représentation d'un montant monétaire.
 * `amount` est toujours en centimes FCFA (entier bigint).
 * Jamais de float/double pour de l'argent.
 */
export interface Money {
  amount: bigint;
  currency: 'XOF';
}

export type { Money as default };
