import { Module } from '@nestjs/common';

import { AiModule } from '../../ai/ai.module';
import { AskKuraBiensController } from './ask-kura-biens.controller';
import { AskKuraBiensService } from './ask-kura-biens.service';

@Module({
  imports: [AiModule],
  controllers: [AskKuraBiensController],
  providers: [AskKuraBiensService],
  exports: [AskKuraBiensService],
})
export class AskKuraBiensModule {}
