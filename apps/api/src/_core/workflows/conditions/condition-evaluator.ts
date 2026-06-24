import type { ConditionDsl, ConditionNode, LeafCondition } from './condition.interface';

/**
 * Évalue un DSL de conditions sans eval() ni code dynamique.
 * Supporte : =, !=, >, <, >=, <=, in, not_in, contains
 * Structure : AND implicite à la racine, OR/AND imbriqués via { or: [...] } / { and: [...] }
 */
export function evaluateConditions(
  conditions: ConditionDsl,
  context: Record<string, unknown>,
): { passed: boolean; results: Array<{ condition: ConditionNode; passed: boolean }> } {
  const results = conditions.map((node) => ({
    condition: node,
    passed: evaluateNode(node, context),
  }));

  return {
    passed: results.every((r) => r.passed),
    results,
  };
}

function evaluateNode(node: ConditionNode, ctx: Record<string, unknown>): boolean {
  if ('and' in node) return node.and.every((n) => evaluateNode(n, ctx));
  if ('or' in node) return node.or.some((n) => evaluateNode(n, ctx));
  return evaluateLeaf(node as LeafCondition, ctx);
}

function evaluateLeaf(leaf: LeafCondition, ctx: Record<string, unknown>): boolean {
  const actual = getNestedValue(ctx, leaf.field);
  const { op, value } = leaf;

  switch (op) {
    case '=': return actual === value;
    case '!=': return actual !== value;
    case '>': return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case '<': return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case '>=': return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case '<=': return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    case 'in': return Array.isArray(value) && value.includes(actual);
    case 'not_in': return Array.isArray(value) && !value.includes(actual);
    case 'contains':
      return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
    default:
      return false;
  }
}

/** Résout un chemin pointé (ex: 'payload.montant') dans un objet imbriqué. */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
