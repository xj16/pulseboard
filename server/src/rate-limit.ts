/**
 * A tiny token-bucket rate limiter.
 *
 * Each socket gets one bucket. Board mutations cost a token; the bucket refills
 * continuously at `ratePerSec`. This lets a real user burst (open the toolbar,
 * add a few widgets) while preventing a malicious client from spamming
 * `board:reset` or adding unbounded widgets in a tight loop.
 *
 * Kept dependency-free and pure (time is injected) so it is trivially testable.
 */

export interface RateLimiterOptions {
  /** Maximum tokens the bucket can hold (the burst size). */
  capacity: number;
  /** Tokens added per second. */
  ratePerSec: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly ratePerSec: number;
  private last: number;

  constructor(options: RateLimiterOptions, now: number = Date.now()) {
    this.capacity = options.capacity;
    this.ratePerSec = options.ratePerSec;
    this.tokens = options.capacity;
    this.last = now;
  }

  /**
   * Attempt to spend one token. Returns true if allowed (and consumes a token),
   * false if the bucket is empty (the action should be rejected).
   */
  tryRemove(now: number = Date.now()): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Current token count (mainly for tests/introspection). */
  available(now: number = Date.now()): number {
    this.refill(now);
    return this.tokens;
  }

  private refill(now: number): void {
    if (now <= this.last) return;
    const elapsedSec = (now - this.last) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.ratePerSec,
    );
    this.last = now;
  }
}
