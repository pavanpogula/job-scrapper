/**
 * Jest config for integration tests that need a real PostgreSQL (TEST_DATABASE_URL, localhost only).
 * Unlike jest.config.js it does NOT map @prisma/client to the in-memory mock.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 60000,
  modulePathIgnorePatterns: ['<rootDir>/output', '<rootDir>/documentation', '<rootDir>/node_modules'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          target: 'es2020',
          module: 'commonjs',
          lib: ['es2020', 'dom'],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true
        }
      }
    ]
  }
};
