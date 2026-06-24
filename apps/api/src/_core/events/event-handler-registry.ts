import { Injectable } from '@nestjs/common';

export type HandlerFn = (event: unknown) => Promise<void>;

export interface RegisteredHandler {
  eventType: string;
  handlerName: string;
  fn: HandlerFn;
}

/**
 * Registre des handlers d'événements de domaine.
 * Peuplé au démarrage par EventHandlerDiscovery.
 */
@Injectable()
export class EventHandlerRegistry {
  private readonly handlers = new Map<string, RegisteredHandler[]>();

  register(handler: RegisteredHandler): void {
    const list = this.handlers.get(handler.eventType) ?? [];
    list.push(handler);
    this.handlers.set(handler.eventType, list);
  }

  getHandlers(eventType: string): RegisteredHandler[] {
    return this.handlers.get(eventType) ?? [];
  }

  getAllEventTypes(): string[] {
    return [...this.handlers.keys()];
  }
}
