import { Module } from '@nestjs/common';

import { AiModule } from '../../ai/ai.module';
import { BiensIndexerService } from './biens-indexer.service';

@Module({
  imports: [AiModule],
  providers: [BiensIndexerService],
  exports: [BiensIndexerService],
})
export class BiensIndexerModule {}
