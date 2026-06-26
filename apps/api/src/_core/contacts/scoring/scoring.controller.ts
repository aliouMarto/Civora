import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { TenantContextService } from '../../tenancy/tenant-context.service';

import { ContactScoringService } from './contact-scoring.service';

/**
 * Endpoint de transparence du scoring : retourne les facteurs qui composent le score.
 * Permet à l'agence de comprendre pourquoi un contact a tel score.
 */
@Controller('contacts')
export class ScoringController {
  constructor(
    private readonly scoring: ContactScoringService,
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  @Get(':id/score-explanation')
  @RequirePermissions('contacts:read')
  async explain(@Param('id', ParseUUIDPipe) id: string) {
    const agence_id = this.tenantCtx.requireAgenceId();
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact || contact.agence_id !== agence_id) {
      throw new NotFoundException(`Contact ${id} introuvable`);
    }

    const features = await this.scoring.featuresFromContact(contact);
    const result = await this.scoring.scoreFromFeatures(features);

    return {
      contact_id: id,
      score: result.score,
      category: result.category,
      confidence: result.confidence,
      factors: result.factors,
      computed_at: new Date().toISOString(),
      formula_doc: 'docs/scoring/contacts.md',
      note:
        result.confidence === 'low'
          ? 'Estimation préliminaire — moins de 5 interactions enregistrées'
          : undefined,
    };
  }
}
