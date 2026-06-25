import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string, url = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'): Socket {
  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(url, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    timeout: 10_000,
  });

  socket.on('connect', () => {
    console.debug('[realtime] connected', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.debug('[realtime] disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[realtime] connect error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
