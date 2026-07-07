/**
 * Room registry + JSON persistence.
 *
 * Each room is an independent collaborative board keyed by a URL-safe slug
 * (e.g. `/b/team-alpha`). This turns "open two tabs" into "share a link":
 * different links are different boards, all fed by the same live simulator.
 *
 * Boards are persisted to a small JSON file per room under `dataDir` and
 * reloaded on startup, so a server restart no longer wipes shared layouts.
 * Writes are debounced so a burst of drags does not hammer the disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Board } from './board.js';
import type { BoardState } from './protocol.js';

/** The room a client lands on when it does not specify one. */
export const DEFAULT_ROOM = 'main';

/** Clamp a requested room name to a safe, bounded slug. */
export function normalizeRoom(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_ROOM;
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : DEFAULT_ROOM;
}

export interface RoomsOptions {
  /** Directory to persist room JSON files in. Persistence is off if omitted. */
  dataDir?: string;
  /** Debounce window for disk writes, ms. Defaults to 500. */
  saveDebounceMs?: number;
}

export class Rooms {
  private readonly boards = new Map<string, Board>();
  private readonly dataDir?: string;
  private readonly saveDebounceMs: number;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: RoomsOptions = {}) {
    this.dataDir = options.dataDir;
    this.saveDebounceMs = options.saveDebounceMs ?? 500;
    if (this.dataDir) {
      mkdirSync(this.dataDir, { recursive: true });
      this.loadAll();
    }
  }

  /** Room slugs that currently exist in memory. */
  list(): string[] {
    return [...this.boards.keys()];
  }

  /** Get (or lazily create) the board for a room. */
  get(room: string): Board {
    let board = this.boards.get(room);
    if (!board) {
      board = new Board();
      this.boards.set(room, board);
      this.scheduleSave(room);
    }
    return board;
  }

  /**
   * Apply a mutation via a callback and persist if it changed the board.
   * Returns the board so callers can broadcast the fresh snapshot.
   */
  touch(room: string): void {
    this.scheduleSave(room);
  }

  private scheduleSave(room: string): void {
    if (!this.dataDir) return;
    const existing = this.pending.get(room);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.pending.delete(room);
      this.save(room);
    }, this.saveDebounceMs);
    // Do not keep the process alive purely for a pending disk write.
    if (typeof handle.unref === 'function') handle.unref();
    this.pending.set(room, handle);
  }

  private save(room: string): void {
    if (!this.dataDir) return;
    const board = this.boards.get(room);
    if (!board) return;
    try {
      const file = join(this.dataDir, `${room}.json`);
      writeFileSync(file, JSON.stringify(board.snapshot()), 'utf8');
    } catch {
      // Persistence is best-effort; never crash the server over a disk hiccup.
    }
  }

  /** Flush all pending writes immediately (used on graceful shutdown). */
  flush(): void {
    if (!this.dataDir) return;
    for (const [room, handle] of this.pending) {
      clearTimeout(handle);
      this.save(room);
    }
    this.pending.clear();
  }

  private loadAll(): void {
    if (!this.dataDir || !existsSync(this.dataDir)) return;
    let files: string[] = [];
    try {
      files = readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    for (const file of files) {
      const room = file.replace(/\.json$/, '');
      try {
        const raw = readFileSync(join(this.dataDir, file), 'utf8');
        const state = JSON.parse(raw) as BoardState;
        if (
          state &&
          typeof state.rev === 'number' &&
          Array.isArray(state.widgets)
        ) {
          this.boards.set(room, new Board(state));
        }
      } catch {
        // Skip a corrupt file rather than failing startup.
      }
    }
  }
}
