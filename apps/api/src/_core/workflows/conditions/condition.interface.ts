/**
 * DSL JSON minimal pour les conditions de workflow.
 *
 * Opérateurs supportés : =, !=, >, <, >=, <=, in, not_in, contains
 *
 * Exemple (AND implicite sur le tableau de root):
 * [
 *   { field: "payload.montant", op: ">", value: 100000 },
 *   { field: "payload.statut", op: "=", value: "impaye" }
 * ]
 *
 * Avec OR :
 * { or: [
 *   { field: "payload.canal", op: "=", value: "email" },
 *   { field: "payload.canal", op: "=", value: "sms" }
 * ]}
 */

export type ConditionOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'contains';

export interface LeafCondition {
  field: string;
  op: ConditionOperator;
  value: unknown;
}

export interface AndCondition {
  and: ConditionNode[];
}

export interface OrCondition {
  or: ConditionNode[];
}

export type ConditionNode = LeafCondition | AndCondition | OrCondition;
export type ConditionDsl = ConditionNode[];
