import { useEffect, useRef } from 'react';
import type { ServerEvent } from '@cc/shared';
import { WS_URL } from './config';

type Listener = (e: ServerEvent) => void;
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry = 0;

/** One shared, self-reconnecting WebSocket for the whole app. */
function connect() {
  socket = new WebSocket(WS_URL);
  socket.onopen = () => {
    retry = 0;
  };
  socket.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as ServerEvent;
      listeners.forEach((l) => l(event));
    } catch {
      /* ignore malformed messages */
    }
  };
  socket.onclose = () => {
    socket = null;
    setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
  };
}

export function useServerEvents(handler: Listener) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) connect();
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}
