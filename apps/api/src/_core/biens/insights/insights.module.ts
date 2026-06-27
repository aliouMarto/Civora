import { Module } from '@nestjs/common';

import { BiensRepository } from '../repositories/biens.repository';
import { BiensInsightsService } from './biens-insights.service';
import { InsightsController } from './insights.controller';

@Module({
  controllers: [InsightsController],
  providers: [BiensInsightsService, BiensRepository],
  exports: [BiensInsightsService],
})
export class BiensInsightsModule {}
