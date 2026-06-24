import { Body, Controller, Get, Post } from '@nestjs/common';

import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import type { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload): Promise<object> {
    return this.users.getMe(user);
  }

  @Post('invitations')
  @RequirePermissions('equipe:admin')
  createInvitation(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<object> {
    return this.users.createInvitation(dto, user);
  }
}
