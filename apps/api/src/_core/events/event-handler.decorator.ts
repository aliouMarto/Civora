import { SetMetadata } from '@nestjs/common';

export const EVENT_HANDLER_KEY = 'civora:event_handler';

export interface EventHandlerMeta {
  eventType: string;
  handlerName: string;
}

/**
 * Décorateur de méthode qui marque un handler comme consommateur d'un type d'événement.
 *
 * @example
 * @OnDomainEvent('bail.signe')
 * async handleBailSigne(event: DomainEvent<BailSignePayload>): Promise<void> { ... }
 */
export function OnDomainEvent(eventType: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const handlerName = `${target.constructor.name}.${String(propertyKey)}`;
    SetMetadata<string, EventHandlerMeta>(EVENT_HANDLER_KEY, { eventType, handlerName })(
      target,
      propertyKey,
      descriptor,
    );
    return descriptor;
  };
}
