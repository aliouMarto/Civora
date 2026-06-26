import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { AiRouter } from '../providers/router';
import { chunkText } from './chunking';

export interface StoreEmbeddingsParams {
  sourceType: string;
  sourceId: string;
  text: string;
  /** Si omis, utilise le provider par défaut pour embed */
  model?: string;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly router: AiRouter,
  ) {}

  async store(params: StoreEmbeddingsParams): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const { primary } = this.router.route('embed');

    const chunks = chunkText(params.text);
    const embedded = await Promise.all(
      chunks.map(async (chunk) => {
        const { vector, model } = await primary.embed(chunk.content);
        return { chunk, vector, model };
      }),
    );

    // withTenant pose app.agence_id pour les requêtes raw qui ne passent pas
    // par l'auto-extension de PrismaService.
    await this.prisma.withTenant(agence_id, async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM ai_embeddings WHERE agence_id = $1 AND source_type = $2 AND source_id = $3`,
        agence_id,
        params.sourceType,
        params.sourceId,
      );

      for (const { chunk, vector, model } of embedded) {
        const vectorStr = `[${vector.join(',')}]`;
        await tx.$executeRawUnsafe(
          `INSERT INTO ai_embeddings (agence_id, source_type, source_id, chunk_index, content, embedding, model)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
          agence_id,
          params.sourceType,
          params.sourceId,
          chunk.index,
          chunk.content,
          vectorStr,
          model,
        );
      }
    });

    this.logger.log(
      `embedded ${chunks.length} chunks for ${params.sourceType}/${params.sourceId} (agence=${agence_id})`,
    );
  }
}
