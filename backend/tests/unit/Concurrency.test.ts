/**
 * @file Concurrency Utilities Tests
 * @summary Unit test suite for createLimiter and chunk helper functions
 * @tags Unit Test, Concurrency, Limiter, Async
 */

import { createLimiter, chunk } from '../../src/lib/Concurrency';

describe('Concurrency Utilities', () => {
  describe('createLimiter', () => {
    it('should limit maximum concurrent executions to the specified limit', async () => {
      const concurrency = 3;
      const limit = createLimiter(concurrency);
      let activeCount = 0;
      let maxSeenActive = 0;

      const tasks = Array.from({ length: 10 }, (_, i) =>
        limit(async () => {
          activeCount++;
          maxSeenActive = Math.max(maxSeenActive, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 30));
          activeCount--;
          return i;
        })
      );

      const results = await Promise.all(tasks);

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(maxSeenActive).toBeLessThanOrEqual(concurrency);
      expect(maxSeenActive).toBe(concurrency);
      expect(activeCount).toBe(0);
    });

    it('should propagate errors from tasks and continue processing subsequent tasks', async () => {
      const limit = createLimiter(2);
      const results: string[] = [];

      const task1 = limit(async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push('task1');
        return 'success1';
      });

      const task2 = limit(async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('Task 2 Failed');
      });

      const task3 = limit(async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push('task3');
        return 'success3';
      });

      await expect(task1).resolves.toBe('success1');
      await expect(task2).rejects.toThrow('Task 2 Failed');
      await expect(task3).resolves.toBe('success3');
      expect(results).toEqual(['task1', 'task3']);
    });

    it('should dynamically throttle concurrency on rate limit and recover after consecutive successes', () => {
      const limit = createLimiter(10, {
        minConcurrency: 2,
        recoveryThreshold: 3,
        defaultCooldownMs: 0
      });

      expect(limit.getConcurrency()).toBe(10);

      // Rate limit halves concurrency (10 -> 5 -> 2)
      limit.onRateLimit(0);
      expect(limit.getConcurrency()).toBe(5);
      limit.onRateLimit(0);
      expect(limit.getConcurrency()).toBe(2);

      // 3 consecutive successes step concurrency up by 1
      limit.onSuccess();
      limit.onSuccess();
      expect(limit.getConcurrency()).toBe(2);
      limit.onSuccess();
      expect(limit.getConcurrency()).toBe(3);
    });
  });

  describe('chunk', () => {
    it('should split an array into chunks of the specified size', () => {
      const items = [1, 2, 3, 4, 5, 6, 7];
      expect(chunk(items, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should handle exact division', () => {
      const items = [1, 2, 3, 4];
      expect(chunk(items, 2)).toEqual([[1, 2], [3, 4]]);
    });

    it('should return an empty array when given an empty array', () => {
      expect(chunk([], 5)).toEqual([]);
    });

    it('should return a single chunk when size is greater than array length', () => {
      expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    });
  });
});
