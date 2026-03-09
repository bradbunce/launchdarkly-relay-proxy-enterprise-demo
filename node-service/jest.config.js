module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archived-iptables-tests/',
    '/docker-container-spawning-fix/',
    '/relay-proxy-disconnect-networking-fix/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'server.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@exodus/bytes|jsdom)/)'
  ],
  watchman: false
};
