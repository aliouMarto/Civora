import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { EVENT_HANDLER_KEY, type EventHandlerMeta } from './event-handler.decorator';
import { EventHandlerRegistry } from './event-handler-registry';

/**
 * Parcourt tous les providers NestJS au démarrage et enregistre
 * les méthodes annotées @OnDomainEvent dans le registry.
 */
@Injectable()
export class EventHandlerDiscovery implements OnModuleInit {
  private readonly logger = new Logger(EventHandlerDiscovery.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly registry: EventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      const proto = Object.getPrototypeOf(instance) as object;

      this.scanner.getAllMethodNames(proto).forEach((methodName) => {
        const meta = this.reflector.get<EventHandlerMeta>(
          EVENT_HANDLER_KEY,
          (instance as Record<string, unknown>)[methodName] as object,
        );
        if (!meta) return;

        this.registry.register({
          eventType: meta.eventType,
          handlerName: meta.handlerName,
          fn: (event: unknown) =>
            ((instance as Record<string, (...args: unknown[]) => Promise<void>>)[methodName])(event),
        });

        this.logger.log(`Handler enregistré: ${meta.handlerName} → "${meta.eventType}"`);
      });
    }
  }
}
