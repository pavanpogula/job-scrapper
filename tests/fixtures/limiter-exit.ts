/**
 * @file Limiter Process Exit Test Fixture
 * @summary Runs tasks through createLimiter with onRateLimit to reproduce and verify process exit behavior
 * @tags Fixture, Concurrency, Limiter, ProcessExit
 */

import { createLimiter } from '../../src/lib/Concurrency';

async function main() {
    const limit = createLimiter(2, { defaultCooldownMs: 100 });
    let tasksDone = 0;

    const tasks = [1, 2, 3, 4].map(id =>
        limit(async () => {
            if (id === 1) {
                limit.onRateLimit(100);
            }
            await new Promise(r => setTimeout(r, 10));
            tasksDone++;
        })
    );

    await Promise.all(tasks);
    console.log(`tasksDone=${tasksDone}/4`);
}

main().catch(err => {
    console.error('Fixture error:', err);
    process.exit(1);
});
