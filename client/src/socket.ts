/**
 * Typed Socket.IO client singleton.
 *
 * In dev the Vite proxy forwards /socket.io to the Node server, so the
 * default (same-origin) connection just works. `VITE_SERVER_URL` can point
 * the client at a remote server when needed.
 */

import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './protocol';

export type PulseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const url = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: PulseSocket = io(url, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
