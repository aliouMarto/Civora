/**
 * Formatage des montants en centimes FCFA → FCFA lisibles.
 * Garantit BigInt-safe (les montants peuvent dépasser Number.MAX_SAFE_INTEGER).
 */
const FCFA = new Intl.NumberFormat('fr-FR', { useGrouping: true });

export function formatXof(centimes: string | bigint | number | null | undefined): string {
  if (centimes === null || centimes === undefined) return '—';
  // Division par 100 en bigint pour rester précis sur les gros montants
  if (typeof centimes === 'bigint') {
    const fcfa = centimes / 100n;
    return `${FCFA.format(Number(fcfa))} FCFA`;
  }
  if (typeof centimes === 'string') {
    if (!/^\d+$/.test(centimes)) return '—';
    const fcfa = BigInt(centimes) / 100n;
    return `${FCFA.format(Number(fcfa))} FCFA`;
  }
  return `${FCFA.format(Math.round(centimes / 100))} FCFA`;
}

export function formatYield(pct: string | number | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
  const n = typeof pct === 'string' ? Number(pct) : pct;
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(1)} %`;
}

export function formatSurface(surface: string | number | null | undefined): string {
  if (surface === null || surface === undefined) return '—';
  const n = typeof surface === 'string' ? Number(surface) : surface;
  if (Number.isNaN(n)) return '—';
  return `${FCFA.format(Math.round(n))} m²`;
}
