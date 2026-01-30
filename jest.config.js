module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    'server.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
};
