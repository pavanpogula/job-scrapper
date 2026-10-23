/**
 * @file Concurrency Utilities
 * @summary Provides a CommonJS-compatible concurrency limiter for parallel processing
 * @tags Utility, Concurrency, Async
 */

/**
 * @summary Creates a concurrency limiter for controlled parallel execution
 * @example
 * const limit = createLimiter(5);
 * await Promise.all(items.map(item => limit(() => processItem(item))));
 */
export function createLimiter(concurrency: number) {
    let activeCount = 0;
    const queue: Array<() => void> = [];

    const next = () => {
        if (queue.length > 0 && activeCount < concurrency) {
            activeCount++;
            const run = queue.shift()!;
            run();
        }
    };

    return async <T>(fn: () => Promise<T>): Promise<T> => {
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
    };
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
