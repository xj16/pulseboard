/**
 * Typed Socket.IO client singleton.
 *
 * In dev the Vite proxy forwards /socket.io to the Node server, so the
 * default (same-origin) connection just works. `VITE_SERVER_URL` can point
 * the client at a remote server when needed.
 *
 * The room is taken from the URL so a link is shareable: `/b/team-alpha`
 * (or `?room=team-alpha`) joins that collaborative board; the bare `/` joins
 * the default room.
 */

import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './protocol';

export type PulseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Derive the room slug from the current URL, defaulting to 'main'. */
export function roomFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('room');
  if (fromQuery) return fromQuery;
  const m = window.location.pathname.match(/^\/b\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  return 'main';
}

const url = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: PulseSocket = io(url, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  query: { room: roomFromLocation() },
});
