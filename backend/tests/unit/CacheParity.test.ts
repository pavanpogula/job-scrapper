/**
 * @file Cache-versus-database parity tests
 * @summary Guards BF-019: every published cache body is byte-equivalent to what the DB fallback returns for the same request
 * @tags Testing, Cache, Parity, Publisher, ReadThrough
 */

import zlib from 'zlib';
import { FakeRedis } from '../helpers/fakeRedis';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { publishCacheGeneration } from '../../src/cache/Publisher';
import { KEY_CURRENT, genKey } from '../../src/lib/cache/keys';
import { queryJobs, computeFacets, queryCompanies } from '../../src/api/db/queries';
import { ReadThroughService } from '../../src/api/cache/ReadThrough';

const jobBase = {
  departmentId: 'eng',
  locationId: 'loc',
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryInterval: null,
  isRemote: false,
  region: null,
  city: null,
  active: true,
  isListed: true,
  metadata: {},
  department: { name: 'Engineering' },
  location: { name: 'Remote' },
};

function makeJob(n: number) {
  const date = new Date(Date.UTC(2026, 0, 1, 0, n));
  return {
    ...jobBase,
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    ashbyId: `ashby-${n}`,
    title: `Engineer ${n}`,
    companySlug: n % 2 ? 'acme' : 'beta',
    workplaceType: n % 3 ? 'Remote' : 'OnSite',
    employmentType: 'FullTime',
    country: n % 2 ? 'US' : 'CA',
    contentHash: `hash-${n}`,
    publishedAt: date,
    createdAt: date,
    updatedAt: date,
    company: { name: n % 2 ? 'Acme' : 'Beta', logoUrl: null, slug: n % 2 ? 'acme' : 'beta' },
  };
}

async function readBody(redis: FakeRedis, gen: string, field: string): Promise<any> {
  const raw = await redis.hgetBuffer(genKey(gen), field);
  expect(raw).not.toBeNull();
  return JSON.parse(zlib.gunzipSync(raw as Buffer).toString('utf8'));
}

const asWire = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('Cache and DB response parity (BF-019)', () => {
  let redis: FakeRedis;
  let prisma: any;

  beforeEach(() => {
    redis = new FakeRedis();
    prisma = createStatefulPrisma();
    for (let n = 1; n <= 30; n++) prisma.seed('job', makeJob(n));
    prisma.seed('company', { id: 'a', slug: 'acme', name: 'Acme', status: 'ACTIVE' });
    prisma.seed('company', { id: 'b', slug: 'beta', name: 'Beta', status: 'ACTIVE' });
  });

  async function publish(): Promise<string> {
    const res = await publishCacheGeneration({
      runId: 'parity-run',
      scrapeFinishedAt: '2026-01-01T12:00:00Z',
      prisma,
      redis: redis as any,
    });
    expect(res.status).toBe('published');
    return (await redis.get(KEY_CURRENT)) as string;
  }

  it('jobs pages match the DB path exactly, including meta.hasNext and meta.hasPrev', async () => {
    const gen = await publish();
    for (const page of [1, 2]) {
      const cached = await readBody(redis, gen, `jobs?page=${page}`);
      const db = asWire(await queryJobs(prisma, { page, pageSize: 25 } as any));
      expect(cached.meta).toEqual(db.meta);
      // The stateful Prisma mock ignores skip/take when select is set, so emulate the page window here.
      const dbIds = db.data.map((j: any) => j.id).slice((page - 1) * 25, page * 25);
      expect(cached.data.map((j: any) => j.id)).toEqual(dbIds);
    }
    const page1 = await readBody(redis, gen, 'jobs?page=1');
    expect(page1.meta.hasNext).toBe(true);
    expect(page1.meta.hasPrev).toBe(false);
  });

  it('facets are stored as the bare object the DB path returns', async () => {
    const gen = await publish();
    const cached = await readBody(redis, gen, 'facets');
    expect(cached).toEqual(asWire(await computeFacets(prisma)));
    expect(cached.data).toBeUndefined();
  });

  it('meta is stored bare with the DB-path field set', async () => {
    const gen = await publish();
    const cached = await readBody(redis, gen, 'meta');
    expect(Object.keys(cached).sort()).toEqual(
      ['activeJobs', 'generation', 'hiringCompanies', 'lastScrapeAt', 'withSalary'].sort()
    );
    expect(cached.activeJobs).toBe(30);
    expect(cached.hiringCompanies).toBe(2);
  });

  it('companies pages use the DB-path top-level shape', async () => {
    const gen = await publish();
    const cached = await readBody(redis, gen, 'companies?page=1');
    expect(cached).toEqual(asWire(await queryCompanies(prisma, { page: 1, pageSize: 30 })));
    expect(cached.meta).toBeUndefined();
  });

  it('caches every company page, not just the first 100 companies', async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({
      id: `c${i}`,
      slug: `co-${String(i).padStart(3, '0')}`,
      name: `Company ${String(i).padStart(3, '0')}`,
      status: 'ACTIVE',
    }));
    prisma.company.findMany = jest.fn(async (args: any) => {
      const sorted = [...all].sort((x, y) => x.name.localeCompare(y.name));
      return sorted
        .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? sorted.length))
        .map((c) => ({ ...c, logoUrl: null, _count: { jobs: 0 } }));
    });
    prisma.company.count = jest.fn(async () => all.length);

    const gen = await publish();
    const lastPage = await readBody(redis, gen, 'companies?page=9');
    expect(lastPage.total).toBe(250);
    expect(lastPage.totalPages).toBe(9);
    expect(lastPage.data).toHaveLength(10);
    expect(lastPage.data[9].name).toBe('Company 249');
  });

  it('serves a cache hit with the same body the database fallback would return', async () => {
    const gen = await publish();
    const service = new ReadThroughService();
    service.setRedisClient(redis);
    const res: any = { setHeader: jest.fn() };
    const db = asWire(await computeFacets(prisma));
    const served = await service.serveView('facets', true, res, async () => db);
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(served).toEqual(db);
    expect(gen).toBeDefined();
  });

  it('connects an idle lazyConnect client before the first command instead of falling back', async () => {
    await publish();
    let status = 'wait';
    const connect = jest.fn(async () => {
      status = 'ready';
    });
    const guarded = new Proxy(redis as any, {
      get(target, prop) {
        if (prop === 'status') return status;
        if (prop === 'connect') return connect;
        const value = target[prop];
        if (typeof value !== 'function') return value;
        return (...args: any[]) => {
          if (status !== 'ready') return Promise.reject(new Error("Stream isn't writeable and enableOfflineQueue options is false"));
          return value.apply(target, args);
        };
      },
    });
    const service = new ReadThroughService();
    service.setRedisClient(guarded);
    const res: any = { setHeader: jest.fn() };
    const db = asWire(await computeFacets(prisma));
    const [a, b] = await Promise.all([
      service.serveView('facets', true, res, async () => ({ fromDb: true })),
      service.serveView('facets', true, res, async () => ({ fromDb: true })),
    ]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(a).toEqual(db);
    expect(b).toEqual(db);
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  });
});
