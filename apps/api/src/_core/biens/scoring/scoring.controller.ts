import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { BiensScoringService } from './biens-scoring.service';

@Controller('biens')
export class BiensScoringController {
  constructor(private readonly scoring: BiensScoringService) {}

  /**
   * Renvoie le breakdown détaillé du score d'un bien (transparence).
   * Le score persisté côté DB est mis à jour par le worker — ici on
   * recalcule "live" pour exposer les facteurs courants.
   */
  @Get(':id/score-explanation')
  @RequirePermissions('biens:read')
  explain(@Param('id', ParseUUIDPipe) id: string) {
    return this.scoring.explain(id);
  }
}
