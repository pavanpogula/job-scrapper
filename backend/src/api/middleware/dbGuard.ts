/**
 * @file Database Overload Guard Middleware and Concurrency Limiter
 * @summary Protects PostgreSQL connection pool with concurrency limits (max 3), queuing (max 10), and single-flight deduplication
 * @tags Database, Concurrency, Guard, Backpressure, Resilience
 */

/**
 * Concurrency limiter and queue manager for database queries.
 */
export class DbGuard {
  private activeCount = 0;
  private queue: Array<() => void> = [];
  public readonly maxActive: number;
  public readonly maxQueue: number;

  constructor(maxActive = 3, maxQueue = 10) {
    this.maxActive = maxActive;
    this.maxQueue = maxQueue;
  }

  /**
   * Acquires a concurrency slot or enqueues until one is available.
   */
  public async acquire(): Promise<() => void> {
    if (this.activeCount < this.maxActive) {
      this.activeCount++;
      return () => this.release();
    }

    if (this.queue.length >= this.maxQueue) {
      const error = Object.assign(new Error('Service temporarily overloaded. Please retry shortly.'), {
        status: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: 5,
      });
      throw error;
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve(() => this.release());
      });
    });
  }

  /**
   * Releases an active slot and dequeues the next waiting task.
   */
  private release(): void {
    this.activeCount--;
    if (this.queue.length > 0 && this.activeCount < this.maxActive) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Executes an async task within the concurrency limit.
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Returns current active and queue status.
   */
  public getStatus() {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      maxActive: this.maxActive,
      maxQueue: this.maxQueue,
    };
  }
}

export const dbGuard = new DbGuard();

const inFlightQueries = new Map<string, Promise<unknown>>();

/**
 * @summary Single-flight helper ensuring only one in-flight DB query per cache key
 */
export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightQueries.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightQueries.delete(key);
    }
  })();

  inFlightQueries.set(key, promise);
  return promise;
}
