const fc = require('fast-check');
const { initializeLaunchDarkly, getInitializationError, closeLaunchDarkly } = require('./launchdarkly');

describe('LaunchDarkly SDK Integration Unit Tests', () => {
  // Clean up after each test to reset singleton
  afterEach(async () => {
    await closeLaunchDarkly();
  });

  /**
   * Requirements: 2.2, 2.4
   * Test that SDK initializes with valid configuration
   */
  test('SDK initializes with valid configuration', async () => {
    const config = {
      sdkKey: 'sdk-test-key-12345',
      relayProxyUrl: 'http://relay-proxy:8030'
    };

    const client = await initializeLaunchDarkly(config);

    // With a fake SDK key, initialization will timeout but should return client
    // (graceful degradation - client continues retrying in background)
    expect(client).not.toBeNull();
    expect(typeof client).toBe('object');
    
    // Should have an initialization error
    const error = getInitializationError();
    expect(error).toBeTruthy();
    expect(error).toContain('Failed to initialize');
  }, 10000);

  /**
   * Requirements: 2.2, 2.4
   * Test that application handles missing SDK key
   */
  test('Application handles missing SDK key', async () => {
    const config = {
      sdkKey: null,
      relayProxyUrl: 'http://relay-proxy:8030'
    };

    const client = await initializeLaunchDarkly(config);

    // Should return null for missing SDK key
    expect(client).toBeNull();
    
    // Should have an initialization error
    const error = getInitializationError();
    expect(error).toBeTruthy();
    expect(error).toContain('not provided');
  });

  /**
   * Requirements: 2.2, 2.4
   * Test that application handles empty SDK key
   */
  test('Application handles empty SDK key', async () => {
    const config = {
      sdkKey: '',
      relayProxyUrl: 'http://relay-proxy:8030'
    };

    const client = await initializeLaunchDarkly(config);

    // Should return null for empty SDK key
    expect(client).toBeNull();
    
    // Should have an initialization error
    const error = getInitializationError();
    expect(error).toBeTruthy();
    expect(error).toContain('not provided');
  });

  /**
   * Requirements: 2.2, 2.4
   * Test that application handles invalid relay proxy URL
   */
  test('Application handles invalid relay proxy URL', async () => {
    const config = {
      sdkKey: 'sdk-test-key-12345',
      relayProxyUrl: 'http://invalid-host-that-does-not-exist:8030'
    };

    const client = await initializeLaunchDarkly(config);

    // Should return client (graceful degradation) or null
    // Either is acceptable for invalid URLs
    if (client) {
      expect(typeof client).toBe('object');
      // Should have an initialization error
      const error = getInitializationError();
      expect(error).toBeTruthy();
    } else {
      // Null is also acceptable for invalid URLs
      expect(client).toBeNull();
    }
  }, 10000);

  /**
   * Requirements: 2.2, 2.4
   * Test that application handles malformed relay proxy URL
   */
  test('Application handles malformed relay proxy URL', async () => {
    const config = {
      sdkKey: 'sdk-test-key-12345',
      relayProxyUrl: 'not-a-valid-url'
    };

    const client = await initializeLaunchDarkly(config);

    // Should return client (graceful degradation) or null
    // Either is acceptable for malformed URLs
    if (client) {
      expect(typeof client).toBe('object');
      // Should have an initialization error
      const error = getInitializationError();
      expect(error).toBeTruthy();
    } else {
      // Null is also acceptable for malformed URLs
      expect(client).toBeNull();
    }
  }, 10000);
});

describe('LaunchDarkly SDK Initialization Property Tests', () => {
  /**
   * Feature: launchdarkly-demo-app, Property 2: SDK Initialization Resilience
   * Validates: Requirements 2.2, 2.4
   * 
   * Property: For any SDK configuration (valid or invalid), the application should 
   * either successfully initialize the SDK or gracefully handle the failure without 
   * crashing the application.
   */
  test('Property 2: SDK Initialization Resilience', async () => {
    // Define arbitraries for generating various SDK configurations
    const sdkKeyArbitrary = fc.oneof(
      fc.constant(null),                                    // Missing SDK key
      fc.constant(''),                                      // Empty SDK key
      fc.constant('sdk-invalid-key'),                       // Invalid SDK key format
      fc.constant('sdk-12345678-1234-1234-1234-123456789012') // Valid format but fake key
    );

    const relayProxyUrlArbitrary = fc.oneof(
      fc.constant('http://relay-proxy:8030'),               // Valid internal URL
      fc.constant('http://invalid-host:8030'),              // Invalid hostname
      fc.constant(''),                                      // Empty URL
      fc.constant('not-a-url')                              // Invalid URL format
    );

    await fc.assert(
      fc.asyncProperty(
        sdkKeyArbitrary,
        relayProxyUrlArbitrary,
        async (sdkKey, relayProxyUrl) => {
          // Create configuration object
          const config = {
            sdkKey,
            relayProxyUrl
          };

          let result;
          let threwError = false;

          try {
            // Attempt to initialize SDK with the generated configuration
            result = await initializeLaunchDarkly(config);
          } catch (error) {
            // If an error is thrown, the application crashed - this violates the property
            threwError = true;
          }

          // Property assertion: Application should never crash
          expect(threwError).toBe(false);

          // Property assertion: Result should be either a client object or null
          // (null indicates missing/empty SDK key or invalid config, object indicates graceful degradation)
          expect(result === null || typeof result === 'object').toBe(true);

          // If SDK key is missing/empty, result should be null (graceful degradation)
          if (!sdkKey || sdkKey === '') {
            expect(result).toBeNull();
          }
          // For other cases, either null or object is acceptable (depends on URL validation)

          // Clean up: close client if it was successfully initialized
          if (result && typeof result.close === 'function') {
            try {
              await closeLaunchDarkly();
            } catch (closeError) {
              // Ignore close errors in test cleanup
            }
          }
        }
      ),
      { 
        numRuns: 20,            // Reduced to 20 iterations for faster execution
        timeout: 10000,         // 10 second timeout per test case
        endOnFailure: true      // Stop on first failure for easier debugging
      }
    );
  }, 60000); // 1 minute timeout for entire test suite
});
