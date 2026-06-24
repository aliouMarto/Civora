import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { TenantContextService } from '../../_core/tenancy/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() private readonly tenantCtx?: TenantContextService) {
    super();
  }

  /**
   * Exécute `fn` dans une transaction PostgreSQL avec `SET LOCAL app.agence_id`.
   * Toute opération Prisma à l'intérieur du callback est isolée au tenant courant.
   *
   * Usage dans les services métier :
   *   const result = await this.prisma.withTenant(agenceId, (tx) => tx.entite.findMany());
   */
  async withTenant<T>(
    agenceId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL app.agence_id = ${agenceId}`;
      return fn(tx);
    });
  }

  /**
   * Variante qui lit l'agenceId depuis le TenantContextService (AsyncLocalStorage).
   * Pratique dans les controllers/services qui ont déjà le contexte injecté par le middleware.
   */
  async withCurrentTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const agenceId = this.tenantCtx?.requireAgenceId();
    if (!agenceId) throw new Error('No tenant context');
    return this.withTenant(agenceId, fn);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
