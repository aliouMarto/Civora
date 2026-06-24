import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listForUser({ userId: user.sub, page, limit });
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.svc.markRead(id, user.sub);
  }
}
