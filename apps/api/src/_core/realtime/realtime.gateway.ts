import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { channel, event } from './channels';
import { RealtimeService } from './realtime.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

const MAX_EVENTS_PER_SECOND = 20;

@WebSocketGateway({
  namespace: '/',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  /** Compteur throttle par socket : { socketId → { count, resetAt } } */
  private readonly throttle = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      const pub = new Redis(redisUrl);
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Socket.IO Redis adapter activé');
    }
    this.realtimeService.setServer(server);
    this.logger.log('RealtimeGateway initialisé');
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const payload = this.authenticate(socket);
      // Stocke le payload sur le socket pour usage ultérieur
      (socket as any)._user = payload;

      // Join les canaux privés côté serveur (le client ne choisit pas ses rooms)
      await socket.join(channel.tenant(payload.agence_id));
      await socket.join(channel.user(payload.sub));

      socket.emit(event.CONNECT_ACK, {
        userId: payload.sub,
        agenceId: payload.agence_id,
        channels: [channel.tenant(payload.agence_id), channel.user(payload.sub)],
      });

      this.logger.log(`connect: ${socket.id} user=${payload.sub} agence=${payload.agence_id}`);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    this.throttle.delete(socket.id);
    const user = (socket as any)._user as JwtPayload | undefined;
    this.logger.log(`disconnect: ${socket.id}${user ? ` user=${user.sub}` : ''}`);
  }

  /** Vérifie le JWT dans socket.handshake.auth.token. Lève une erreur si invalide. */
  private authenticate(socket: Socket): JwtPayload {
    const token: string | undefined =
      socket.handshake.auth?.['token'] ??
      socket.handshake.headers['authorization']?.replace(/^Bearer /i, '');

    if (!token) throw new Error('Missing token');

    const payload = this.jwt.verify<JwtPayload>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });

    if (!payload.sub || !payload.agence_id) throw new Error('Invalid payload');
    return payload;
  }

  /** Vérifie le throttle anti-DoS. Retourne false si le socket est throttlé. */
  isThrottled(socketId: string): boolean {
    const now = Date.now();
    const entry = this.throttle.get(socketId) ?? { count: 0, resetAt: now + 1000 };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 1000;
    }

    entry.count++;
    this.throttle.set(socketId, entry);

    return entry.count > MAX_EVENTS_PER_SECOND;
  }
}
