import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { Request } from 'express';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { AskKuraBiensService } from './ask-kura-biens.service';

export class AskKuraBiensDto {
  @IsString()
  @Length(1, 500)
  question!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  max_results?: number;
}

@Controller('biens')
export class AskKuraBiensController {
  constructor(private readonly svc: AskKuraBiensService) {}

  @Post('ask')
  @RequirePermissions('biens:read')
  @HttpCode(HttpStatus.OK)
  ask(@Body() dto: AskKuraBiensDto, @Req() req: Request) {
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    return this.svc.ask({ question: dto.question, maxResults: dto.max_results }, correlationId);
  }
}
