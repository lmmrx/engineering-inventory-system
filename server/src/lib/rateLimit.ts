import type { NextFunction, Request, Response } from "express";

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


/**
 * Caps how many requests one key (an IP address, or a signed-in user) may
 * make per window, answering 429 with Retry-After beyond that. Guards the
 * API against floods and scripted scraping; set generously, since a whole
 * hotel often shares one public IP address.
 */
export function rateLimit({ max, windowMs, key }: { max: number; windowMs: number; key: (req: Request) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const id = key(req);
    let entry = hits.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(id, entry);
    }
    entry.count++;
    // Keep memory bounded under a flood of distinct keys.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }
    next();
  };
}
