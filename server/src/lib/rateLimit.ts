/**
 * A small fixed-window counter kept in memory. The API runs as a single
 * instance, so a per-process store is enough; a restart simply resets the
 * windows, which errs on the side of letting legitimate users back in.
 */
export class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Seconds until the key may try again, or 0 if it isn't blocked. */
  retryAfter(key: string, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  fail(key: string, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
    // Keep memory bounded under a flood of distinct keys.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
