/**
 * Per-connection identity.
 *
 * Every socket is assigned a friendly, stable handle (adjective + animal) and a
 * distinct color when it connects. This is what turns the bare presence *count*
 * into visible collaborators: named cursors, colored drag rings, and an avatar
 * stack in the toolbar. No accounts, no storage — identity lives for the life
 * of the socket.
 */

import { randomUUID } from 'node:crypto';
import type { Peer } from './protocol.js';

const ADJECTIVES = [
  'Teal',
  'Amber',
  'Coral',
  'Violet',
  'Cyan',
  'Lime',
  'Rose',
  'Azure',
  'Gold',
  'Jade',
  'Rust',
  'Slate',
];

const ANIMALS = [
  'Otter',
  'Falcon',
  'Lynx',
  'Heron',
  'Marten',
  'Ibis',
  'Gecko',
  'Wren',
  'Bison',
  'Orca',
  'Fox',
  'Moth',
];

/** A palette of high-contrast, distinct cursor colors. */
const COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a3e635',
  '#fbbf24',
  '#c084fc',
  '#34d399',
  '#fb7185',
  '#60a5fa',
  '#f59e0b',
  '#2dd4bf',
];

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Mint a fresh peer identity. A `rand` function can be injected for
 * deterministic tests; it defaults to Math.random.
 */
export function makePeer(rand: () => number = Math.random): Peer {
  const name = `${pick(ADJECTIVES, rand)} ${pick(ANIMALS, rand)}`;
  const color = pick(COLORS, rand);
  return { id: randomUUID(), name, color };
}
