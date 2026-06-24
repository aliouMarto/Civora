import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeService } from '../realtime.service';
import { channel, event } from '../channels';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService() {
  const emitted: Array<{ room: string; event: string; data: unknown }> = [];

  const mockTo = vi.fn().mockImplementation((room: string) => ({
    emit: (evt: string, data: unknown) => {
      emitted.push({ room, event: evt, data });
    },
  }));

  const mockServer = { to: mockTo } as any;

  const svc = new RealtimeService();
  svc.setServer(mockServer);

  return { svc, emitted, mockTo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RealtimeService.emitToTenant()', () => {
  it('émet sur le canal tenant.<agence_id>', () => {
    const { svc, emitted } = makeService();

    svc.emitToTenant('agence-abc', 'activity.live', { type: 'bail.signe' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.room).toBe('tenant.agence-abc');
    expect(emitted[0]!.event).toBe('activity.live');
  });

  it('isolation inter-tenant : n\'émet pas sur tenant.agence-B quand cible = agence-A', () => {
    const { svc, emitted } = makeService();

    svc.emitToTenant('agence-A', 'test.event', { x: 1 });

    expect(emitted.some((e) => e.room === 'tenant.agence-B')).toBe(false);
    expect(emitted[0]!.room).toBe('tenant.agence-A');
  });
});

describe('RealtimeService.emitToUser()', () => {
  it('émet uniquement sur user.<id>', () => {
    const { svc, emitted } = makeService();

    svc.emitToUser('user-123', event.NOTIFICATION_NEW, { notificationId: 'n1' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.room).toBe('user.user-123');
    expect(emitted[0]!.event).toBe('notification.new');
  });

  it('n\'émet pas sur le canal d\'un autre utilisateur', () => {
    const { svc, emitted } = makeService();

    svc.emitToUser('user-A', 'msg', { x: 1 });

    expect(emitted.every((e) => e.room !== 'user.user-B')).toBe(true);
  });
});

describe('RealtimeService — server non initialisé', () => {
  it('emitToTenant ne lève pas d\'erreur si le server est absent', () => {
    const svc = new RealtimeService();
    // setServer non appelé

    expect(() => svc.emitToTenant('agence-abc', 'test', {})).not.toThrow();
  });

  it('emitToUser ne lève pas d\'erreur si le server est absent', () => {
    const svc = new RealtimeService();

    expect(() => svc.emitToUser('user-123', 'test', {})).not.toThrow();
  });
});

describe('Canaux — nommage', () => {
  it('channel.tenant construit le bon identifiant', () => {
    expect(channel.tenant('abc-123')).toBe('tenant.abc-123');
  });

  it('channel.user construit le bon identifiant', () => {
    expect(channel.user('user-456')).toBe('user.user-456');
  });

  it('channel.module construit le bon identifiant', () => {
    expect(channel.module('saisonnier', 'agence-xyz')).toBe('module.saisonnier.agence-xyz');
  });
});

describe('Adaptateur Redis — test structurel', () => {
  it('après setServer(), les émissions passent par le server injecté', () => {
    const emitted: string[] = [];
    const mockServer = {
      to: (room: string) => ({
        emit: (evt: string) => emitted.push(`${room}::${evt}`),
      }),
    } as any;

    const svc1 = new RealtimeService();
    const svc2 = new RealtimeService();

    // Simule deux instances partageant le même "server" (via Redis adapter, c'est la même abstraction)
    svc1.setServer(mockServer);
    svc2.setServer(mockServer);

    svc1.emitToTenant('agence-abc', 'activity.live', {});
    svc2.emitToUser('user-xyz', 'notification.new', {});

    expect(emitted).toContain('tenant.agence-abc::activity.live');
    expect(emitted).toContain('user.user-xyz::notification.new');
  });
});
