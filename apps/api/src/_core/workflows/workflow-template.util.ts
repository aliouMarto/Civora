/** Résout un template de la forme '{{path.to.value}}' dans un contexte. */
export function resolveTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path: string) => {
    const val = getNestedValue(ctx, path);
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
