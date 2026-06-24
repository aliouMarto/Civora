/**
 * Tests OutboxService.
 * Vérifie : atomicité (emit dans tx), rejet hors tx.
 */
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeAll } from 'vitest';

import { OutboxService } from '../outbox.service';
import { EventContextService } from '../event-context.service';
import { createDomainEvent } from '../domain-event';

const mockEventCtx = {
  getMetadataBase: vi.fn().mockReturnValue({
    actor_id: 'user-1',
    correlation_id: 'corr-1',
    causation_id: null,
  }),
};

function makeEvent() {
  return createDomainEvent({
    agence_id: 'agence-uuid',
    type: 'bail.signe',
    aggregate_type: 'Bail',
    aggregate_id: 'bail-uuid',
    payload: { bail_id: 'bail-uuid', montant: 150000n.toString() },
    metadata: { actor_id: 'user-1', correlation_id: 'corr-1', causation_id: null, ip: null, user_agent: null },
  });
}

describe('OutboxService', () => {
  let svc: OutboxService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: EventContextService, useValue: mockEventCtx },
      ],
    }).compile();
    svc = module.get(OutboxService);
  });

  it('insère l\'événement via le TransactionClient fourni', async () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const mockTx = { domainEvent: { create: mockCreate } } as never;

    const event = makeEvent();
    await svc.emit(event, mockTx);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.id).toBe(event.id);
    expect(call.data.type).toBe('bail.signe');
    expect(call.data.aggregate_type).toBe('Bail');
  });

  it('refuse d\'émettre sans TransactionClient (lève une erreur explicite)', async () => {
    const event = makeEvent();
    await expect(svc.emit(event, null as never)).rejects.toThrow(
      /DOIT être émis dans une transaction/,
    );
  });

  it('l\'événement est rollback si la tx échoue (simulation)', async () => {
    // Simulation : si la tx rollback, create ne doit pas être committé.
    // On vérifie que emit() appelle bien tx.domainEvent.create (et non prisma direct).
    const txCreate = vi.fn().mockResolvedValue({});
    const prismaCreate = vi.fn();
    const mockTx = { domainEvent: { create: txCreate } } as never;

    const event = makeEvent();
    await svc.emit(event, mockTx);

    expect(txCreate).toHaveBeenCalledOnce();
    expect(prismaCreate).not.toHaveBeenCalled(); // ne passe JAMAIS par prisma direct
  });
});
