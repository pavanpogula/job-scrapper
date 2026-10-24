/**
 * @file Stateful Prisma mock factory for unit and integration testing
 * @summary In-memory database emulator matching PrismaClient contracts for Job, Company, Department, and Location
 * @tags Testing, Prisma, Mock, Factory
 */

export interface StatefulPrismaData {
    companies?: any[];
    jobs?: any[];
    departments?: any[];
    locations?: any[];
}

export function createStatefulPrisma(initialData: StatefulPrismaData = {}) {
    const companies = new Map<string, any>();
    const jobs = new Map<string, any>();
    const departments = new Map<string, any>();
    const locations = new Map<string, any>();

    // Seed initial data
    if (initialData.companies) {
        initialData.companies.forEach(c => companies.set(c.slug, { ...c }));
    }
    if (initialData.jobs) {
        initialData.jobs.forEach(j => jobs.set(j.ashbyId || j.id, { ...j }));
    }
    if (initialData.departments) {
        initialData.departments.forEach(d => departments.set(d.name, { ...d }));
    }
    if (initialData.locations) {
        initialData.locations.forEach(l => locations.set(l.name, { ...l }));
    }

    const jobCalls = {
        findMany: [] as any[],
        createMany: [] as any[],
        updateMany: [] as any[],
        upsert: [] as any[],
        count: [] as any[],
        groupBy: [] as any[]
    };

    const companyCalls = {
        findMany: [] as any[],
        update: [] as any[],
        updateMany: [] as any[],
        count: [] as any[]
    };

    const job = {
        findMany: jest.fn(async (args?: any) => {
            jobCalls.findMany.push(args);
            let result = Array.from(jobs.values());

            if (args?.where) {
                const w = args.where;
                if (w.active !== undefined) {
                    result = result.filter(j => j.active === w.active);
                }
                if (w.isListed !== undefined) {
                    result = result.filter(j => j.isListed === w.isListed);
                }
                if (w.companySlug !== undefined) {
                    result = result.filter(j => j.companySlug === w.companySlug);
                }
                if (w.ashbyId?.in) {
                    const set = new Set(w.ashbyId.in);
                    result = result.filter(j => set.has(j.ashbyId));
                }
                if (w.ashbyId?.notIn) {
                    const set = new Set(w.ashbyId.notIn);
                    result = result.filter(j => !set.has(j.ashbyId));
                }
            }

            if (args?.select) {
                return result.map(j => {
                    const selected: any = {};
                    for (const key of Object.keys(args.select)) {
                        if (args.select[key]) {
                            selected[key] = j[key];
                        }
                    }
                    return selected;
                });
            }

            if (args?.skip !== undefined || args?.take !== undefined) {
                const skip = args.skip || 0;
                const take = args.take !== undefined ? args.take : result.length;
                result = result.slice(skip, skip + take);
            }

            return result;
        }),

        findFirst: jest.fn(async (args?: any) => {
            const list = await job.findMany({ ...args, take: 1 });
            return list[0] || null;
        }),

        findUnique: jest.fn(async (args: any) => {
            const key = args?.where?.ashbyId || args?.where?.id;
            return jobs.get(key) || null;
        }),

        createMany: jest.fn(async (args: { data: any[]; skipDuplicates?: boolean }) => {
            jobCalls.createMany.push(args);
            let count = 0;
            for (const item of args.data) {
                const key = item.ashbyId || item.id;
                if (args.skipDuplicates && jobs.has(key)) {
                    continue;
                }
                jobs.set(key, { id: `id-${key}`, ...item, createdAt: new Date(), updatedAt: new Date() });
                count++;
            }
            return { count };
        }),

        updateMany: jest.fn(async (args: { where: any; data: any }) => {
            jobCalls.updateMany.push(args);
            let count = 0;
            const w = args.where;
            for (const [key, current] of jobs.entries()) {
                let matches = true;
                if (w.companySlug && current.companySlug !== w.companySlug) matches = false;
                if (w.ashbyId?.notIn && w.ashbyId.notIn.includes(current.ashbyId)) matches = false;
                if (w.active !== undefined && current.active !== w.active) matches = false;

                if (matches) {
                    jobs.set(key, { ...current, ...args.data, updatedAt: new Date() });
                    count++;
                }
            }
            return { count };
        }),

        upsert: jest.fn(async (args: { where: any; create: any; update: any }) => {
            jobCalls.upsert.push(args);
            const key = args.where.ashbyId || args.where.id;
            const existing = jobs.get(key);
            if (existing) {
                const updated = { ...existing, ...args.update, updatedAt: new Date() };
                jobs.set(key, updated);
                return updated;
            } else {
                const created = { id: `id-${key}`, ...args.create, createdAt: new Date(), updatedAt: new Date() };
                jobs.set(key, created);
                return created;
            }
        }),

        count: jest.fn(async (args?: any) => {
            jobCalls.count.push(args);
            const list = await job.findMany(args);
            return list.length;
        }),

        groupBy: jest.fn(async (args: any) => {
            jobCalls.groupBy.push(args);
            const field = args.by[0];
            const counts = new Map<string, number>();
            for (const j of jobs.values()) {
                if (args.where?.active !== undefined && j.active !== args.where.active) continue;
                if (args.where?.isListed !== undefined && j.isListed !== args.where.isListed) continue;
                const val = j[field];
                if (val !== null && val !== undefined) {
                    counts.set(val, (counts.get(val) || 0) + 1);
                }
            }
            return Array.from(counts.entries()).map(([k, c]) => ({
                [field]: k,
                _count: { [field]: c, _all: c }
            }));
        })
    };

    const company = {
        findMany: jest.fn(async (args?: any) => {
            companyCalls.findMany.push(args);
            let result = Array.from(companies.values());
            if (args?.where?.status) {
                if (typeof args.where.status === 'string') {
                    result = result.filter(c => c.status === args.where.status);
                } else if (args.where.status?.in) {
                    const set = new Set(args.where.status.in);
                    result = result.filter(c => set.has(c.status));
                }
            }
            if (args?.where?.slug) {
                if (typeof args.where.slug === 'string') {
                    result = result.filter(c => c.slug === args.where.slug);
                } else if (args.where.slug?.in) {
                    const set = new Set(args.where.slug.in);
                    result = result.filter(c => set.has(c.slug));
                }
            }
            if (args?.select) {
                return result.map(c => {
                    const item: any = {};
                    for (const k of Object.keys(args.select)) {
                        if (args.select[k]) item[k] = c[k];
                    }
                    return item;
                });
            }
            return result;
        }),

        findUnique: jest.fn(async (args: any) => {
            const slug = args?.where?.slug;
            return companies.get(slug) || null;
        }),

        findFirst: jest.fn(async (args?: any) => {
            const list = await company.findMany(args);
            return list[0] || null;
        }),

        update: jest.fn(async (args: { where: { slug?: string; id?: string }; data: any }) => {
            companyCalls.update.push(args);
            const slug = args.where.slug;
            const existing = companies.get(slug!);
            if (existing) {
                const updated = { ...existing, ...args.data };
                companies.set(slug!, updated);
                return updated;
            }
            return null;
        }),

        updateMany: jest.fn(async (args: any) => {
            companyCalls.updateMany.push(args);
            return { count: 0 };
        }),

        count: jest.fn(async (args?: any) => {
            companyCalls.count.push(args);
            return companies.size;
        })
    };

    const department = {
        upsert: jest.fn(async (args: any) => {
            const name = args.where.name;
            let existing = departments.get(name);
            if (!existing) {
                existing = { id: `dept-${name.toLowerCase().replace(/\s+/g, '-')}`, name };
                departments.set(name, existing);
            }
            return existing;
        }),
        findUnique: jest.fn(async (args: any) => departments.get(args.where.name) || null)
    };

    const location = {
        upsert: jest.fn(async (args: any) => {
            const name = args.where.name;
            let existing = locations.get(name);
            if (!existing) {
                existing = { id: `loc-${name.toLowerCase().replace(/\s+/g, '-')}`, name };
                locations.set(name, existing);
            }
            return existing;
        }),
        findUnique: jest.fn(async (args: any) => locations.get(args.where.name) || null)
    };

    const $transaction = jest.fn(async (promisesOrFn: any) => {
        if (Array.isArray(promisesOrFn)) {
            return Promise.all(promisesOrFn);
        }
        if (typeof promisesOrFn === 'function') {
            return promisesOrFn({ job, company, department, location });
        }
        return [];
    });

    const $executeRaw = jest.fn(async () => 1);
    const $queryRaw = jest.fn(async () => []);
    const $disconnect = jest.fn(async () => undefined);

    return {
        job,
        company,
        department,
        location,
        $transaction,
        $executeRaw,
        $queryRaw,
        $disconnect,
        // Inspections
        _data: {
            companies,
            jobs,
            departments,
            locations
        },
        _calls: {
            job: jobCalls,
            company: companyCalls
        }
    };
}
