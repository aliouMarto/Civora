import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from '../realtime.gateway';
import { RealtimeService } from '../realtime.service';
import type { Socket } from 'socket.io';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGateway(jwtVerifyResult: unknown = null, shouldThrow = false) {
  const mockJwt = {
    verify: vi.fn().mockImplementation(() => {
      if (shouldThrow) throw new Error('invalid token');
      return jwtVerifyResult;
    }),
  } as unknown as JwtService;

  const mockConfig = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-secret-32-chars-minimum-ok';
      if (key === 'REDIS_URL') return undefined; // pas de Redis en test
      return undefined;
    }),
  } as unknown as ConfigService;

  const mockRealtimeService = {
    setServer: vi.fn(),
  } as unknown as RealtimeService;

  const gateway = new RealtimeGateway(mockJwt, mockConfig, mockRealtimeService);

  // Initialiser sans Redis (afterInit avec server mock)
  const mockServer = { adapter: vi.fn(), to: vi.fn() } as any;
  gateway.afterInit(mockServer);

  return { gateway, mockJwt };
}

function makeSocket(token?: string, joins: string[] = []): Socket {
  return {
    id: 'socket-test-id',
    handshake: {
      auth: token ? { token } : {},
      headers: {},
    },
    join: vi.fn().mockImplementation((room: string) => {
      joins.push(room);
      return Promise.resolve();
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    _user: undefined,
  } as unknown as Socket;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RealtimeGateway — handshake JWT', () => {
  it('connexion refusée sans token → disconnect(true) appelé', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket(/* pas de token */);

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('connexion refusée avec token invalide → disconnect(true) appelé', async () => {
    const { gateway } = makeGateway(null, /* shouldThrow */ true);
    const socket = makeSocket('invalid.jwt.token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('connexion acceptée avec JWT valide → socket non déconnecté', async () => {
    const payload = { sub: 'user-123', agence_id: 'agence-abc', email: 'x@x.io', permissions: [] };
    const { gateway } = makeGateway(payload);
    const socket = makeSocket('valid.jwt.token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('au connect, socket rejoint tenant.<agence_id> et user.<sub>', async () => {
    const payload = { sub: 'user-123', agence_id: 'agence-abc', email: 'x@x.io', permissions: [] };
    const { gateway } = makeGateway(payload);
    const joins: string[] = [];
    const socket = makeSocket('valid.jwt.token', joins);

    await gateway.handleConnection(socket);

    expect(joins).toContain('tenant.agence-abc');
    expect(joins).toContain('user.user-123');
  });

  it('connect.ack émis avec userId, agenceId et channels', async () => {
    const payload = { sub: 'user-456', agence_id: 'agence-xyz', email: 'y@y.io', permissions: [] };
    const { gateway } = makeGateway(payload);
    const socket = makeSocket('valid.jwt.token');

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('connect.ack', {
      userId: 'user-456',
      agenceId: 'agence-xyz',
      channels: ['tenant.agence-xyz', 'user.user-456'],
    });
  });

  it('payload sans sub → connexion refusée', async () => {
    const payload = { agence_id: 'agence-abc' }; // manque sub
    const { gateway } = makeGateway(payload);
    const socket = makeSocket('valid.jwt.token');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('RealtimeGateway — throttling', () => {
  it('isThrottled retourne false pour les premiers appels', () => {
    const { gateway } = makeGateway({ sub: 'u', agence_id: 'a', email: 'x', permissions: [] });

    for (let i = 0; i < 20; i++) {
      expect(gateway.isThrottled('socket-1')).toBe(false);
    }
  });

  it('isThrottled retourne true après dépassement du seuil (>20/s)', () => {
    const { gateway } = makeGateway({ sub: 'u', agence_id: 'a', email: 'x', permissions: [] });

    for (let i = 0; i < 20; i++) gateway.isThrottled('socket-2');
    expect(gateway.isThrottled('socket-2')).toBe(true);
  });
});
