import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  agenceId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class TenantContextService {
  /**
   * Exécute `fn` avec le contexte tenant positionné.
   * Tout appel à `getAgenceId()` à l'intérieur de `fn` (même via des Promises
   * ou des callbacks) retournera l'agenceId correct.
   */
  run<T>(agenceId: string, fn: () => T): T {
    return storage.run({ agenceId }, fn);
  }

  /** Retourne l'agenceId du contexte courant, ou null si hors contexte. */
  getAgenceId(): string | null {
    return storage.getStore()?.agenceId ?? null;
  }

  /** Lève une erreur si le contexte tenant n'est pas positionné. */
  requireAgenceId(): string {
    const id = this.getAgenceId();
    if (!id) {
      throw new Error('TenantContext: no agence_id in current async context');
    }
    return id;
  }
}
