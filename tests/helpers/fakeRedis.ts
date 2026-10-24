/**
 * @file In-memory Fake Redis for unit testing
 * @summary Emulates ioredis commands with command counting and fail-safe state
 * @tags Testing, Redis, Mock, In-Memory
 */

export class FakeRedis {
    private data = new Map<string, string | Buffer>();
    private hashes = new Map<string, Map<string, string | Buffer>>();
    private ttls = new Map<string, number>();
    public status: string = 'ready';
    public commandCount: number = 0;
    private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

    on(event: string, handler: (...args: any[]) => void): this {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(handler);
        return this;
    }

    emit(event: string, ...args: any[]): boolean {
        const handlers = this.eventListeners.get(event) || [];
        handlers.forEach(h => h(...args));
        return handlers.length > 0;
    }

    async connect(): Promise<void> {
        this.status = 'ready';
    }

    async quit(): Promise<'OK'> {
        this.status = 'end';
        return 'OK';
    }

    async disconnect(): Promise<void> {
        this.status = 'end';
    }

    async get(key: string): Promise<string | null> {
        this.commandCount++;
        const val = this.data.get(key);
        if (val === undefined) return null;
        return Buffer.isBuffer(val) ? val.toString('utf8') : val;
    }

    async getBuffer(key: string): Promise<Buffer | null> {
        this.commandCount++;
        const val = this.data.get(key);
        if (val === undefined) return null;
        return Buffer.isBuffer(val) ? val : Buffer.from(val, 'utf8');
    }

    async set(key: string, value: string | Buffer, ...args: any[]): Promise<'OK' | null> {
        this.commandCount++;
        let exSeconds: number | null = null;
        let pxMs: number | null = null;
        let nx = false;

        for (let i = 0; i < args.length; i++) {
            const arg = typeof args[i] === 'string' ? args[i].toUpperCase() : args[i];
            if (arg === 'EX' && i + 1 < args.length) {
                exSeconds = Number(args[++i]);
            } else if (arg === 'PX' && i + 1 < args.length) {
                pxMs = Number(args[++i]);
            } else if (arg === 'NX') {
                nx = true;
            }
        }

        if (nx && (this.data.has(key) || this.hashes.has(key))) {
            return null;
        }

        this.data.set(key, value);
        if (exSeconds !== null) {
            this.ttls.set(key, Date.now() + exSeconds * 1000);
        } else if (pxMs !== null) {
            this.ttls.set(key, Date.now() + pxMs);
        }
        return 'OK';
    }

    async del(...keys: string[]): Promise<number> {
        this.commandCount++;
        let count = 0;
        for (const k of keys) {
            if (this.data.delete(k)) count++;
            if (this.hashes.delete(k)) count++;
            this.ttls.delete(k);
        }
        return count;
    }

    async unlink(...keys: string[]): Promise<number> {
        return this.del(...keys);
    }

    async expire(key: string, seconds: number): Promise<number> {
        this.commandCount++;
        if (!this.data.has(key) && !this.hashes.has(key)) return 0;
        this.ttls.set(key, Date.now() + seconds * 1000);
        return 1;
    }

    async persist(key: string): Promise<number> {
        this.commandCount++;
        if (this.ttls.delete(key)) return 1;
        return 0;
    }

    async hget(key: string, field: string): Promise<string | null> {
        this.commandCount++;
        const map = this.hashes.get(key);
        if (!map) return null;
        const val = map.get(field);
        if (val === undefined) return null;
        return Buffer.isBuffer(val) ? val.toString('utf8') : val;
    }

    async hgetBuffer(key: string, field: string): Promise<Buffer | null> {
        this.commandCount++;
        const map = this.hashes.get(key);
        if (!map) return null;
        const val = map.get(field);
        if (val === undefined) return null;
        return Buffer.isBuffer(val) ? val : Buffer.from(val, 'utf8');
    }

    async hgetall(key: string): Promise<Record<string, string>> {
        this.commandCount++;
        const map = this.hashes.get(key);
        if (!map) return {};
        const res: Record<string, string> = {};
        for (const [f, v] of map.entries()) {
            res[f] = Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
        }
        return res;
    }

    async hset(key: string, ...args: any[]): Promise<number> {
        this.commandCount++;
        let map = this.hashes.get(key);
        if (!map) {
            map = new Map();
            this.hashes.set(key, map);
        }

        let addedCount = 0;
        if (args.length === 1 && typeof args[0] === 'object' && !Buffer.isBuffer(args[0])) {
            for (const [f, v] of Object.entries(args[0])) {
                if (!map.has(f)) addedCount++;
                map.set(f, v as any);
            }
        } else {
            for (let i = 0; i < args.length; i += 2) {
                const f = args[i];
                const v = args[i + 1];
                if (!map.has(f)) addedCount++;
                map.set(f, v);
            }
        }
        return addedCount;
    }

    async hdel(key: string, ...fields: string[]): Promise<number> {
        this.commandCount++;
        const map = this.hashes.get(key);
        if (!map) return 0;
        let count = 0;
        for (const f of fields) {
            if (map.delete(f)) count++;
        }
        return count;
    }

    async hlen(key: string): Promise<number> {
        this.commandCount++;
        const map = this.hashes.get(key);
        return map ? map.size : 0;
    }

    async dbsize(): Promise<number> {
        this.commandCount++;
        return this.data.size + this.hashes.size;
    }

    async info(_section?: string): Promise<string> {
        this.commandCount++;
        return '# Memory\nused_memory:1048576\nused_memory_human:1M\n';
    }

    async scan(cursor: string | number, ..._args: any[]): Promise<[string, string[]]> {
        this.commandCount++;
        const allKeys = Array.from(new Set([...this.data.keys(), ...this.hashes.keys()]));
        return ['0', allKeys];
    }

    async eval(_script: string, _numKeys: number, ..._args: any[]): Promise<any> {
        this.commandCount += 2;
        return 1;
    }

    multi(): any {
        const queue: Array<() => Promise<any>> = [];
        const proxy: any = {};
        const methods = ['set', 'get', 'del', 'hset', 'hdel', 'expire', 'persist'];

        for (const m of methods) {
            proxy[m] = (...args: any[]) => {
                queue.push(() => (this as any)[m](...args));
                return proxy;
            };
        }

        proxy.exec = async () => {
            this.commandCount += queue.length + 2; // MULTI + EXEC N+2
            const results = [];
            for (const fn of queue) {
                results.push([null, await fn()]);
            }
            return results;
        };

        return proxy;
    }

    pipeline(): any {
        const queue: Array<() => Promise<any>> = [];
        const proxy: any = {};
        const methods = ['set', 'get', 'del', 'hset', 'hdel', 'expire', 'persist'];

        for (const m of methods) {
            proxy[m] = (...args: any[]) => {
                queue.push(() => (this as any)[m](...args));
                return proxy;
            };
        }

        proxy.exec = async () => {
            const results = [];
            for (const fn of queue) {
                results.push([null, await fn()]);
            }
            return results;
        };

        return proxy;
    }
}
