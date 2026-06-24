import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<object> {
    return this.auth.login(dto, req);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<object> {
    return this.auth.refresh(dto.refresh_token, req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refresh_token);
  }
}
