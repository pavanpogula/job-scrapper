/**
 * @file Prisma Client Mock
 * @summary Global mock for @prisma/client to prevent native query-engine loading in Jest
 * @tags Mock, Prisma, Testing
 */

export const mockCompany = {
  findMany: jest.fn().mockResolvedValue([]),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0)
};

export const mockJob = {
  findMany: jest.fn().mockResolvedValue([]),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  groupBy: jest.fn().mockResolvedValue([])
};

export const mockDepartment = {
  findMany: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue({ id: 'mock-dept-id', name: 'Engineering' }),
  count: jest.fn().mockResolvedValue(0)
};

export const mockLocation = {
  findMany: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue({ id: 'mock-loc-id', name: 'Remote' }),
  count: jest.fn().mockResolvedValue(0)
};

export class PrismaClient {
  company = mockCompany;
  job = mockJob;
  department = mockDepartment;
  location = mockLocation;

  $transaction = jest.fn().mockResolvedValue([]);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $queryRaw = jest.fn().mockResolvedValue([]);
  $queryRawUnsafe = jest.fn().mockResolvedValue([]);
}
