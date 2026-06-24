import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { AiRouter } from '../providers/router';

export interface RetrievalResult {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export interface SearchParams {
  sourceType?: string;
  query: string;
  topK?: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly router: AiRouter,
  ) {}

  async search(params: SearchParams): Promise<RetrievalResult[]> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const { primary } = this.router.route('embed');
    const topK = params.topK ?? 5;

    const { vector } = await primary.embed(params.query);
    const vectorStr = `[${vector.join(',')}]`;

    type RawRow = {
      id: string;
      source_type: string;
      source_id: string;
      chunk_index: number;
      content: string;
      similarity: number;
    };

    const rows = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT id, source_type, source_id, chunk_index, content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM ai_embeddings
       WHERE agence_id = $2
         ${params.sourceType ? `AND source_type = $3` : ''}
       ORDER BY embedding <=> $1::vector
       LIMIT $${params.sourceType ? 4 : 3}`,
      vectorStr,
      agence_id,
      ...(params.sourceType ? [params.sourceType, topK] : [topK]),
    );

    return rows.map((r) => ({
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      similarity: Number(r.similarity),
    }));
  }
}
