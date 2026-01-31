// Test script to demonstrate SDK data store contents
const request = require('supertest');
const { createApp } = require('./src/app');

// Mock LaunchDarkly client with sample data store
const mockStore = {
  all: (namespace, callback) => {
    // Simulate what the SDK's internal feature store contains
    const sampleFlags = {
      'user-message': {
        key: 'user-message',
        version: 42,
        on: true,
        variations: [
          'Hello from LaunchDarkly!',
          'Welcome to the demo!',
          'Greetings from the feature flag!'
        ],
        fallthrough: {
          variation: 0
        },
        offVariation: 0,
        targets: [
          {
            values: ['user@example.com'],
            variation: 1
          }
        ],
        rules: [
          {
            id: 'rule-1',
            clauses: [
              {
                attribute: 'email',
                op: 'endsWith',
                values: ['@company.com'],
                negate: false
              }
            ],
            variation: 2
          }
        ],
        prerequisites: [],
        salt: 'abc123',
        trackEvents: false,
        debugEventsUntilDate: null
      },
      'feature-enabled': {
        key: 'feature-enabled',
        version: 15,
        on: true,
        variations: [true, false],
        fallthrough: {
          rollout: {
            variations: [
              { variation: 0, weight: 50000 },
              { variation: 1, weight: 50000 }
            ],
            bucketBy: 'key'
          }
        },
        offVariation: 1,
        targets: [],
        rules: [],
        prerequisites: [],
        salt: 'xyz789',
        trackEvents: true,
        debugEventsUntilDate: null
      }
    };
    
    callback(null, sampleFlags);
  }
};

const mockClient = {
  _config: {
    featureStore: mockStore
  }
};

// Mock the getLaunchDarklyClient function
jest.mock('./src/launchdarkly', () => ({
  getLaunchDarklyClient: () => mockClient,
  getInitializationError: () => null
}));

async function testDataStore() {
  console.log('=== Testing SDK Data Store Endpoint ===\n');
  
  const app = createApp();
  
  const response = await request(app)
    .post('/api/node/sdk-cache')
    .send({});
  
  console.log('Status:', response.status);
  console.log('Response Body:\n');
  console.log(JSON.stringify(response.body, null, 2));
  
  if (response.body.success && response.body.flags) {
    console.log('\n=== Flag Details ===\n');
    
    Object.entries(response.body.flags).forEach(([key, config]) => {
      console.log(`Flag: ${key}`);
      console.log(`  Version: ${config.version}`);
      console.log(`  Enabled: ${config.on}`);
      console.log(`  Variations: ${config.variations.length} variations`);
      console.log(`  Rules: ${config.rules?.length || 0} rules`);
      console.log(`  Targets: ${config.targets?.length || 0} targets`);
      console.log(`  Prerequisites: ${config.prerequisites?.length || 0} prerequisites`);
      console.log('');
    });
  }
}

testDataStore().catch(console.error);
