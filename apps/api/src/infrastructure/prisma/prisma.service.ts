import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { TenantContextService } from '../../_core/tenancy/tenant-context.service';

/**
 * Marqueur d'imbrication : indique que l'opération courante est déjà dans
 * une transaction tenant-pinned. Évite la double ouverture de transactions
 * quand `withTenant` est appelé explicitement à l'intérieur du contexte
 * positionné automatiquement par l'extension.
 */
const tenantTxFlag = new AsyncLocalStorage<true>();

/**
 * Connexion APPLICATIVE — rôle civora_app, soumis à la RLS.
 *
 * RÈGLE DE SÉCURITÉ : ce service DOIT se connecter avec DATABASE_APP_URL,
 * jamais avec DATABASE_URL (qui pointe vers le propriétaire des tables,
 * lequel contourne la RLS même quand FORCE ROW LEVEL SECURITY est posé).
 *
 * Auto-isolation tenant :
 *   Quand `TenantContextService.getAgenceId()` retourne un agence_id, toute
 *   opération Prisma sur un modèle (utilisateur.findMany, etc.) est
 *   automatiquement ré-exécutée dans une transaction qui pose
 *   `SET LOCAL app.agence_id` AVANT le statement. La RLS PostgreSQL voit
 *   donc systématiquement le bon tenant et applique les politiques.
 *
 *   Les opérations raw (`$queryRaw`, `$executeRaw`) ne sont PAS interceptées :
 *   utiliser `withTenant`/`withCurrentTenant` explicitement pour ces cas.
 *
 * Pour les contextes système qui doivent voir plusieurs agences (outbox
 * dispatcher, lookups pré-auth comme la résolution d'un email de login),
 * utiliser PrismaAdminService — chaque usage doit être explicitement justifié.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() private readonly tenantCtx?: TenantContextService) {
    const url = process.env['DATABASE_APP_URL'];
    if (!url) {
      throw new Error(
        'DATABASE_APP_URL is required for PrismaService (RLS-enforced connection). ' +
          'Set it to the connection string of the civora_app role.',
      );
    }
    super({ datasources: { db: { url } } });
  }

  /**
   * Exécute `fn` dans une transaction PostgreSQL avec `SET LOCAL app.agence_id`.
   *
   * À privilégier pour les services qui orchestrent plusieurs opérations
   * (ex : créer un utilisateur + assigner un rôle + écrire un audit).
   * Une seule transaction = une seule session DB = SET LOCAL persistant.
   */
  async withTenant<T>(
    agenceId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!agenceId) throw new Error('withTenant: agence_id is required');
    return tenantTxFlag.run(true, () =>
      this.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.agence_id', ${agenceId}, true)`;
        return fn(tx);
      }),
    );
  }

  /**
   * Variante qui lit l'agenceId depuis le TenantContextService (AsyncLocalStorage).
   */
  async withCurrentTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const agenceId = this.tenantCtx?.requireAgenceId();
    if (!agenceId) throw new Error('No tenant context');
    return this.withTenant(agenceId, fn);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (this.tenantCtx) this.installTenantAutoExtension();
    this.logger.log('Connected to PostgreSQL (civora_app, RLS enforced)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Wrappe chaque accesseur de modèle (this.utilisateur, this.workflow, ...)
   * pour qu'une opération exécutée avec un contexte tenant positionné soit
   * automatiquement ré-exécutée dans une transaction Postgres avec
   * `SET LOCAL app.agence_id`.
   *
   * Le wrapping est appliqué à l'instance via `Object.defineProperty`, ce qui
   * shadow le getter natif de PrismaClient. L'opération est dispatchée sur le
   * TransactionClient à l'intérieur d'un nouveau `$transaction`, garantissant
   * que la session Postgres qui exécute le statement porte bien le contexte.
   */
  private installTenantAutoExtension(): void {
    const tenantCtx = this.tenantCtx;
    if (!tenantCtx) return;

    const baseTransaction = PrismaClient.prototype.$transaction.bind(this) as
      PrismaClient['$transaction'];

    for (const modelMeta of Prisma.dmmf.datamodel.models) {
      const accessorName = modelMeta.name.charAt(0).toLowerCase() + modelMeta.name.slice(1);
      const originalDelegate = (this as unknown as Record<string, unknown>)[accessorName];
      if (!originalDelegate || typeof originalDelegate !== 'object') continue;

      const proxy = new Proxy(originalDelegate as Record<string, unknown>, {
        get: (target, propKey) => {
          const value = Reflect.get(target, propKey);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]) => {
            const tenant = tenantCtx.getAgenceId();
            // Si pas de contexte tenant ou déjà dans une tx tenant-pinned : passthrough
            if (!tenant || tenantTxFlag.getStore() === true) {
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            }
            return tenantTxFlag.run(true, () =>
              baseTransaction(async (tx) => {
                await tx.$executeRaw`SELECT set_config('app.agence_id', ${tenant}, true)`;
                const txDelegate = (tx as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)[accessorName];
                if (!txDelegate) {
                  throw new Error(`PrismaService auto-tenant: missing delegate for model "${accessorName}"`);
                }
                const op = txDelegate[propKey as string];
                if (typeof op !== 'function') {
                  throw new Error(`PrismaService auto-tenant: ${accessorName}.${String(propKey)} is not a function`);
                }
                return op.apply(txDelegate, args);
              }),
            );
          };
        },
      });

      Object.defineProperty(this, accessorName, {
        value: proxy,
        writable: false,
        configurable: false,
        enumerable: true,
      });
    }
  }
}
