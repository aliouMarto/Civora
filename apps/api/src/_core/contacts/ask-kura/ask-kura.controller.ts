import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';

import { AskKuraDto } from './dto/ask-kura.dto';
import { AskKuraService } from './ask-kura.service';

@Controller('contacts')
export class AskKuraController {
  constructor(private readonly svc: AskKuraService) {}

  @Post('ask')
  @RequirePermissions('contacts:read')
  @HttpCode(HttpStatus.OK)
  ask(@Body() dto: AskKuraDto, @Req() req: Request) {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    return this.svc.ask({ question: dto.question, maxResults: dto.max_results }, correlationId);
  }
}
