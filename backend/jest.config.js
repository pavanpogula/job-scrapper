module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Real-database suites run separately via `npm run test:integration` (jest.integration.config.js)
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  clearMocks: true,
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/__mocks__/@prisma/client.ts'
  },
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

