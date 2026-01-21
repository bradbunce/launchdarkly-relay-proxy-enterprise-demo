const fc = require('fast-check');
const { createClient } = require('redis');
const { execSync } = require('child_process');

/**
 * Feature: redis-persistent-store, Property 1: Data Persistence Round Trip
 * Validates: Requirements 4.1, 4.3, 4.4
 * 
 * Property Test: For any data stored in Redis, performing the sequence of operations
 * (store data → restart Redis container → retrieve data) should return the same data
 * that was originally stored.
 */
describe('Redis Data Persistence Property Tests', () => {
  let redisClient;
  let isRedisAvailable = false;

  /**
   * Setup Redis client connection before all tests
   */
  beforeAll(async () => {
    try {
      redisClient = createClient({
        url: 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000
        }
      });

      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
      });

      await redisClient.connect();
      await redisClient.ping();
      isRedisAvailable = true;
      console.log('Redis connection established successfully');
    } catch (error) {
      console.warn('Warning: Redis container is not running or not accessible. Tests will be skipped.');
      console.warn('Please run: docker-compose up -d redis');
      console.warn('Error:', error.message);
      isRedisAvailable = false;
    }
  }, 10000); // 10 second timeout for beforeAll

  /**
   * Cleanup Redis client connection after all tests
   */
  afterAll(async () => {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  }, 10000); // 10 second timeout for afterAll

  /**
   * Helper function to restart Redis container
   */
  async function restartRedisContainer() {
    try {
      console.log('Restarting Redis container...');
      execSync('docker restart redis', { stdio: 'pipe' });
      
      // Wait for Redis to be ready after restart
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Reconnect the client
      if (redisClient && redisClient.isOpen) {
        try {
          await redisClient.quit();
        } catch (err) {
          // Ignore quit errors
        }
      }
      
      redisClient = createClient({
        url: 'redis://localhost:6379',
        socket: {
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });
      
      redisClient.on('error', (err) => {
        // Suppress error logging during reconnection
      });
      
      await redisClient.connect();
      
      // Wait for Redis to be fully ready
      let retries = 20;
      while (retries > 0) {
        try {
          await redisClient.ping();
          console.log('Redis container restarted and ready');
          return;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      throw new Error(`Failed to restart Redis container: ${error.message}`);
    }
  }

  /**
   * Property Test: Data Persistence Round Trip for Simple Key-Value Pairs
   * Tests that any data stored in Redis persists across container restarts
   * 
   * Strategy: Generate 100 random key-value pairs, store them all, restart container once,
   * then verify all data persists. This is more efficient than restarting per iteration.
   */
  test('Property 1: Data persists across Redis container restarts for simple key-value pairs', async () => {
    // Skip if Redis is not available
    if (!isRedisAvailable) {
      console.warn('Skipping test: Redis not available');
      return;
    }

    // Generate 100 random key-value pairs with unique keys
    const testData = await fc.sample(
      fc.tuple(
        fc.integer({ min: 0, max: 999999 }), // Use integer for unique keys
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.double().filter(n => Number.isFinite(n)), // Exclude Infinity, -Infinity, NaN
          fc.array(fc.string()),
          fc.record({
            name: fc.string(),
            value: fc.integer(),
            enabled: fc.boolean()
          })
        )
      ),
      100
    );

    const testKeys = [];

    try {
      // Store all data in Redis
      console.log(`Storing ${testData.length} key-value pairs in Redis...`);
      for (let i = 0; i < testData.length; i++) {
        const [keyNum, value] = testData[i];
        const testKey = `test:persistence:${keyNum}:${i}`; // Ensure uniqueness with index
        testKeys.push(testKey);
        await redisClient.set(testKey, JSON.stringify(value));
      }

      // Verify all data was stored
      console.log('Verifying data was stored...');
      for (let i = 0; i < testData.length; i++) {
        const beforeRestart = await redisClient.get(testKeys[i]);
        expect(beforeRestart).not.toBeNull();
      }

      // Restart Redis container once
      await restartRedisContainer();

      // Verify all data persists after restart
      console.log('Verifying data persists after restart...');
      for (let i = 0; i < testData.length; i++) {
        const [, originalValue] = testData[i];
        const afterRestart = await redisClient.get(testKeys[i]);
        const parsedValue = afterRestart ? JSON.parse(afterRestart) : null;
        
        // Verify retrieved data matches original
        expect(parsedValue).toEqual(originalValue);
      }

      console.log(`Successfully verified ${testData.length} key-value pairs persisted across restart`);
    } finally {
      // Cleanup all test keys
      console.log('Cleaning up test data...');
      for (const testKey of testKeys) {
        try {
          await redisClient.del(testKey);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }, 120000); // 120 second timeout for property test

  /**
   * Property Test: Data Persistence Round Trip for Complex Nested Data
   * Tests that complex nested structures persist across container restarts
   * 
   * Strategy: Generate 100 random complex data structures, store them all, restart container once,
   * then verify all data persists. This is more efficient than restarting per iteration.
   */
  test('Property 1: Data persists across Redis container restarts for complex nested data', async () => {
    // Skip if Redis is not available
    if (!isRedisAvailable) {
      console.warn('Skipping test: Redis not available');
      return;
    }

    // Generate 100 random complex data structures with unique keys
    const testData = await fc.sample(
      fc.tuple(
        fc.integer({ min: 0, max: 999999 }), // Use integer for unique keys
        fc.record({
          id: fc.uuid(),
          metadata: fc.record({
            created: fc.date().map(d => d.toISOString()),
            updated: fc.date().map(d => d.toISOString()),
            version: fc.integer({ min: 1, max: 100 })
          }),
          data: fc.record({
            flags: fc.array(fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              enabled: fc.boolean(),
              value: fc.oneof(fc.string(), fc.integer(), fc.boolean())
            }), { minLength: 1, maxLength: 5 }),
            segments: fc.array(fc.string(), { maxLength: 3 })
          })
        })
      ),
      100
    );

    const testKeys = [];

    try {
      // Store all complex data in Redis
      console.log(`Storing ${testData.length} complex data structures in Redis...`);
      for (let i = 0; i < testData.length; i++) {
        const [keyNum, complexData] = testData[i];
        const testKey = `test:persistence:complex:${keyNum}:${i}`; // Ensure uniqueness with index
        testKeys.push(testKey);
        await redisClient.set(testKey, JSON.stringify(complexData));
      }

      // Verify all data was stored
      console.log('Verifying complex data was stored...');
      for (let i = 0; i < testData.length; i++) {
        const beforeRestart = await redisClient.get(testKeys[i]);
        expect(beforeRestart).not.toBeNull();
      }

      // Restart Redis container once
      await restartRedisContainer();

      // Verify all complex data persists after restart
      console.log('Verifying complex data persists after restart...');
      for (let i = 0; i < testData.length; i++) {
        const [, originalData] = testData[i];
        const afterRestart = await redisClient.get(testKeys[i]);
        const parsedData = afterRestart ? JSON.parse(afterRestart) : null;
        
        // Verify retrieved data matches original
        expect(parsedData).toEqual(originalData);
      }

      console.log(`Successfully verified ${testData.length} complex data structures persisted across restart`);
    } finally {
      // Cleanup all test keys
      console.log('Cleaning up complex test data...');
      for (const testKey of testKeys) {
        try {
          await redisClient.del(testKey);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }, 120000); // 120 second timeout for property test
});
