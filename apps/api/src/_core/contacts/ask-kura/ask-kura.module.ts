import { Module } from '@nestjs/common';

import { AiModule } from '../../ai/ai.module';

import { AskKuraController } from './ask-kura.controller';
import { AskKuraService } from './ask-kura.service';

@Module({
  imports: [AiModule],
  controllers: [AskKuraController],
  providers: [AskKuraService],
  exports: [AskKuraService],
})
export class AskKuraModule {}
