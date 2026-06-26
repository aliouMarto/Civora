import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Connexion ADMIN — rôle civora_admin avec BYPASSRLS.
 *
 * À utiliser UNIQUEMENT pour les workers système qui doivent traverser les
 * frontières de tenant par conception (outbox dispatcher, restore, migrations
 * de données admin). Chaque utilisation doit être explicitement justifiée.
 *
 * Tout usage applicatif normal DOIT passer par PrismaService (rôle civora_app).
 */
@Injectable()
export class PrismaAdminService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaAdminService.name);

  constructor() {
    const url = process.env['DATABASE_ADMIN_URL'];
    if (!url) {
      throw new Error(
        'DATABASE_ADMIN_URL is required for PrismaAdminService (BYPASSRLS connection). ' +
          'Set it to the connection string of the civora_admin role.',
      );
    }
    super({ datasources: { db: { url } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.warn('Connected to PostgreSQL as civora_admin (BYPASSRLS) — system workers only');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
