import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import type { CreateSegmentDto } from './dto/create-segment.dto';

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async list() {
    const agence_id = this.tenantCtx.requireAgenceId();
    return this.prisma.segment.findMany({
      where: { agence_id },
      orderBy: [{ systeme: 'desc' }, { nom: 'asc' }],
    });
  }

  async create(dto: CreateSegmentDto, user: JwtPayload) {
    const agence_id = this.tenantCtx.requireAgenceId();
    return this.prisma.segment.create({
      data: {
        agence_id,
        nom: dto.nom.trim(),
        description: dto.description ?? null,
        filtres: (dto.filtres ?? {}) as object,
        systeme: false,
        created_by: user.sub,
      },
    });
  }

  async listMembres(segmentId: string, page: number, limit: number) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const seg = await this.prisma.segment.findUnique({ where: { id: segmentId } });
    if (!seg || seg.agence_id !== agence_id) {
      throw new NotFoundException(`Segment ${segmentId} introuvable`);
    }
    const [items, total] = await Promise.all([
      this.prisma.segmentMembre.findMany({
        where: { segment_id: segmentId },
        include: {
          contact: {
            select: {
              id: true, nom: true, prenom: true, email: true, telephone: true,
              ville: true, roles: true, score_ia: true, archived_at: true,
            },
          },
        },
        orderBy: { added_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.segmentMembre.count({ where: { segment_id: segmentId } }),
    ]);
    return { items, total, page, limit };
  }

  async delete(segmentId: string): Promise<void> {
    const agence_id = this.tenantCtx.requireAgenceId();
    const seg = await this.prisma.segment.findUnique({ where: { id: segmentId } });
    if (!seg || seg.agence_id !== agence_id) {
      throw new NotFoundException(`Segment ${segmentId} introuvable`);
    }
    if (seg.systeme) {
      throw new ForbiddenException('Les segments système ne sont pas supprimables');
    }
    await this.prisma.segment.delete({ where: { id: segmentId } });
  }
}
