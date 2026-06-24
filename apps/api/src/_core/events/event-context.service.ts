import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { EventMetadata } from './domain-event';

export interface EventContext {
  metadata: Omit<EventMetadata, 'ip' | 'user_agent'>;
}

const storage = new AsyncLocalStorage<EventContext>();

@Injectable()
export class EventContextService {
  run<T>(ctx: EventContext, fn: () => T): T {
    return storage.run(ctx, fn);
  }

  getMetadataBase(): Pick<EventMetadata, 'actor_id' | 'correlation_id' | 'causation_id'> {
    const store = storage.getStore();
    return {
      actor_id: store?.metadata.actor_id ?? null,
      correlation_id: store?.metadata.correlation_id ?? randomUUID(),
      causation_id: store?.metadata.causation_id ?? null,
    };
  }
}
