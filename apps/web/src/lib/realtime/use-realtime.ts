'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

/**
 * S'abonne à un événement Socket.IO. Se désabonne au démontage.
 * La reconnexion est gérée automatiquement par socket.io-client.
 *
 * @param token  JWT access token
 * @param eventName  Nom de l'événement
 * @param handler  Callback appelé à chaque réception
 */
export function useRealtime<T = unknown>(
  token: string | null,
  eventName: string,
  handler: (data: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!token) return;

    const socket = getSocket(token);
    const listener = (data: T) => handlerRef.current(data);

    socket.on(eventName, listener);

    return () => {
      socket.off(eventName, listener);
    };
  }, [token, eventName]);
}
