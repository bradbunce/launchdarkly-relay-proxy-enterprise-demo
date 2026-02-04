export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/jest.config.js/**',
    '!**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
