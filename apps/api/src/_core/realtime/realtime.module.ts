import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { LiveFeedProjector } from './live-feed.projector';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeService, LiveFeedProjector],
  exports: [RealtimeService],
})
export class RealtimeModule {}
