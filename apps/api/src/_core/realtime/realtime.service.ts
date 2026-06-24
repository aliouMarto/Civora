import { Injectable, Logger } from '@nestjs/common';
import { InjectWebSocketServer } from './inject-server.decorator';
import type { Server } from 'socket.io';
import { channel } from './channels';

export interface RealtimePayload {
  event: string;
  data: Record<string, unknown>;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  /** Injecte le serveur Socket.IO (appelé par la gateway après init). */
  setServer(server: Server): void {
    this.server = server;
  }

  /** Émet sur tous les sockets de l'agence (via Redis adapter = multi-instance). */
  emitToTenant(agence_id: string, eventName: string, data: Record<string, unknown>): void {
    if (!this.server) {
      this.logger.warn('RealtimeService.emitToTenant: server not ready');
      return;
    }
    this.server.to(channel.tenant(agence_id)).emit(eventName, data);
    this.logger.debug(`→ tenant.${agence_id} :: ${eventName}`);
  }

  /** Émet sur le canal privé d'un utilisateur. */
  emitToUser(user_id: string, eventName: string, data: Record<string, unknown>): void {
    if (!this.server) {
      this.logger.warn('RealtimeService.emitToUser: server not ready');
      return;
    }
    this.server.to(channel.user(user_id)).emit(eventName, data);
    this.logger.debug(`→ user.${user_id} :: ${eventName}`);
  }

  /** Émet sur un canal de module ciblé. */
  emitToModule(
    module_name: string,
    agence_id: string,
    eventName: string,
    data: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server.to(channel.module(module_name, agence_id)).emit(eventName, data);
  }
}
