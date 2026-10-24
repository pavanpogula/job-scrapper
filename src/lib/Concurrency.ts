/**
 * @file Concurrency Utilities
 * @summary Provides a CommonJS-compatible adaptive concurrency limiter with dynamic rate-limit throttling and cooldown pauses
 * @tags Utility, Concurrency, Async, Adaptive, Rate Limiting
 */

export interface AdaptiveLimiterOptions {
    minConcurrency?: number;
    recoveryThreshold?: number;
    defaultCooldownMs?: number;
}

export interface AdaptiveLimiter {
    <T>(fn: () => Promise<T>): Promise<T>;
    onRateLimit: (cooldownMs?: number) => void;
    onSuccess: () => void;
    getConcurrency: () => number;
    getActiveCount: () => number;
}

/**
 * @summary Creates an adaptive concurrency limiter for controlled parallel execution with dynamic throttling on 429/403
 * @example
 * const limit = createLimiter(15);
 * await Promise.all(items.map(item => limit(() => processItem(item))));
 */
export function createLimiter(
    concurrency: number,
    options: AdaptiveLimiterOptions = {}
): AdaptiveLimiter {
    const maxConcurrency = Math.max(1, concurrency);
    const minConcurrency = Math.max(1, Math.min(options.minConcurrency ?? 2, maxConcurrency));
    const recoveryThreshold = options.recoveryThreshold ?? 25;
    const defaultCooldownMs = options.defaultCooldownMs ?? 2000;

    let currentConcurrency = maxConcurrency;
    let activeCount = 0;
    let consecutiveSuccesses = 0;
    let isPaused = false;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    const queue: Array<() => void> = [];

    const next = () => {
        if (isPaused) return;
        while (queue.length > 0 && activeCount < currentConcurrency) {
            activeCount++;
            const run = queue.shift()!;
            run();
        }
    };

    const limiter = (async <T>(fn: () => Promise<T>): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            const run = async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    activeCount--;
                    next();
                }
            };

            queue.push(run);
            next();
        });
    }) as AdaptiveLimiter;

    limiter.onRateLimit = (cooldownMs: number = defaultCooldownMs) => {
        consecutiveSuccesses = 0;
        currentConcurrency = Math.max(minConcurrency, Math.floor(currentConcurrency / 2));

        if (cooldownMs > 0) {
            isPaused = true;
            if (pauseTimer) clearTimeout(pauseTimer);
            pauseTimer = setTimeout(() => {
                isPaused = false;
                pauseTimer = null;
                next();
            }, cooldownMs);
        }
    };

    limiter.onSuccess = () => {
        if (currentConcurrency < maxConcurrency) {
            consecutiveSuccesses++;
            if (consecutiveSuccesses >= recoveryThreshold) {
                currentConcurrency = Math.min(maxConcurrency, currentConcurrency + 1);
                consecutiveSuccesses = 0;
                next();
            }
        }
    };

    limiter.getConcurrency = () => currentConcurrency;
    limiter.getActiveCount = () => activeCount;

    return limiter;
}

/**
 * @summary Splits an array into chunks of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
