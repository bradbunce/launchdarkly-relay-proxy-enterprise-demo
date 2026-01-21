const { execSync } = require('child_process');
const http = require('http');

/**
 * Integration Tests for Multi-Language Flag Consistency
 * 
 * These tests verify that both Node.js and PHP applications can access
 * feature flags and that they return consistent values when reading from
 * the shared Redis backend.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

describe('Multi-Language Flag Consistency Integration Tests', () => {
  let servicesStarted = false;
  const STARTUP_WAIT_TIME = 30000; // 30 seconds for services to initialize
  const NODE_APP_PORT = 3000;
  const PHP_APP_PORT = 8080;

  /**
   * Helper function to make HTTP GET request
   */
  function httpGet(hostname, port, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        port,
        path,
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Helper function to check if a service is responding
   */
  async function waitForService(hostname, port, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await httpGet(hostname, port, '/');
        if (response.statusCode === 200) {
          return true;
        }
      } catch (error) {
        // Service not ready yet, wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  }

  beforeAll(async () => {
    // Clean up any existing containers
    try {
      execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
    } catch (e) {
      // Ignore if nothing to bring down
    }

    // Start all services
    console.log('Starting Docker Compose services...');
    execSync('docker-compose up -d', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 90000
    });

    servicesStarted = true;

    // Wait for services to be ready
    console.log('Waiting for services to initialize...');
    
    // Wait for Redis to be healthy
    let redisHealthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const healthCheck = execSync('docker exec redis redis-cli ping', {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();
        if (healthCheck === 'PONG') {
          redisHealthy = true;
          console.log('Redis is healthy');
          break;
        }
      } catch (e) {
        // Redis not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!redisHealthy) {
      throw new Error('Redis failed to become healthy');
    }

    // Wait for Relay Proxy to populate flags (check for Redis keys)
    console.log('Waiting for Relay Proxy to populate Redis...');
    let flagsPopulated = false;
    for (let i = 0; i < 30; i++) {
      try {
        const keys = execSync('docker exec redis redis-cli KEYS "*"', {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();
        if (keys.includes('features') || keys.includes('flags')) {
          flagsPopulated = true;
          console.log('Redis has been populated with flags');
          break;
        }
      } catch (e) {
        // Not populated yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait for Node.js app
    console.log('Waiting for Node.js app...');
    const nodeReady = await waitForService('localhost', NODE_APP_PORT, 60); // Increased to 60 attempts
    if (!nodeReady) {
      throw new Error('Node.js app failed to start');
    }
    console.log('Node.js app is ready');

    // Wait for PHP app
    console.log('Waiting for PHP app...');
    const phpReady = await waitForService('localhost', PHP_APP_PORT, 60); // Increased to 60 attempts
    if (!phpReady) {
      throw new Error('PHP app failed to start');
    }
    console.log('PHP app is ready');

    // Additional wait to ensure everything is fully initialized and flags are loaded
    console.log('Waiting for flags to be fully loaded...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds for flags to load
  }, 150000); // 2.5 minute timeout for setup

  afterAll(() => {
    // Clean up
    if (servicesStarted) {
      try {
        console.log('Cleaning up Docker Compose services...');
        execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
      } catch (e) {
        console.error('Error during cleanup:', e.message);
      }
    }
  });

  /**
   * Requirements: 8.1, 8.2
   * Test both Node.js and PHP apps are accessible
   */
  test('Both Node.js and PHP applications are accessible', async () => {
    // Test Node.js app
    const nodeResponse = await httpGet('localhost', NODE_APP_PORT, '/');
    expect(nodeResponse.statusCode).toBe(200);
    expect(nodeResponse.body).toBeTruthy();
    expect(nodeResponse.body.length).toBeGreaterThan(0);

    // Test PHP app
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);
    expect(phpResponse.body).toBeTruthy();
    expect(phpResponse.body.length).toBeGreaterThan(0);
  }, 30000);

  /**
   * Requirements: 8.3
   * Test evaluating same flag in both apps returns same value
   */
  test('Same feature flag returns consistent value across Node.js and PHP apps', async () => {
    // Get flag value from Node.js app
    const nodeResponse = await httpGet('localhost', NODE_APP_PORT, '/');
    expect(nodeResponse.statusCode).toBe(200);
    
    // Extract flag value from Node.js HTML response
    // The flag value is displayed in the message div
    const nodeMatch = nodeResponse.body.match(/<div id="message">([^<]+)<\/div>/);
    expect(nodeMatch).toBeTruthy();
    const nodeFlag = nodeMatch ? nodeMatch[1].trim() : null;
    expect(nodeFlag).toBeTruthy();
    expect(nodeFlag).not.toBe('Loading...');

    // Get flag value from PHP app
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);
    
    // Extract flag value from PHP HTML response
    // The flag value is in a span with specific styling
    const phpMatch = phpResponse.body.match(/<strong>Value:<\/strong>\s*<span[^>]*>([^<]+)<\/span>/);
    expect(phpMatch).toBeTruthy();
    const phpFlag = phpMatch ? phpMatch[1].trim() : null;
    expect(phpFlag).toBeTruthy();

    // Both apps should return the same flag value
    // Note: If flags aren't populated yet, both might show fallback values
    // which is still consistent behavior
    expect(phpFlag).toBe(nodeFlag);
  }, 30000);

  /**
   * Requirements: 8.4
   * Test PHP app indicates daemon mode usage
   */
  test('PHP application indicates daemon mode usage', async () => {
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);

    // Check for daemon mode indicator in the response
    expect(phpResponse.body).toContain('DAEMON MODE');
    expect(phpResponse.body).toContain('daemon mode');
    
    // Verify it shows it's not connected to LaunchDarkly API
    expect(phpResponse.body).toContain('Not connected');
    
    // Verify events are disabled
    expect(phpResponse.body).toContain('false (daemon mode)');
  }, 30000);

  /**
   * Requirements: 8.5
   * Test PHP app displays environment information
   */
  test('PHP application displays environment information', async () => {
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);

    // Check for Redis configuration display
    expect(phpResponse.body).toContain('Redis Host:');
    expect(phpResponse.body).toContain('redis');
    
    expect(phpResponse.body).toContain('Redis Port:');
    expect(phpResponse.body).toContain('6379');
    
    // Check for user context information
    expect(phpResponse.body).toContain('User Context');
    expect(phpResponse.body).toContain('User Key:');
    expect(phpResponse.body).toContain('Email:');
    expect(phpResponse.body).toContain('php-demo@example.com');
    expect(phpResponse.body).toContain('Name:');
    expect(phpResponse.body).toContain('PHP Demo User');
    expect(phpResponse.body).toContain('Language:');
    expect(phpResponse.body).toContain('PHP');
  }, 30000);

  /**
   * Requirements: 8.2, 8.4
   * Test PHP app shows it's reading from Redis
   */
  test('PHP application configuration shows Redis integration', async () => {
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);

    // Verify Redis configuration is displayed
    const redisHostMatch = phpResponse.body.match(/<div class="info-label">Redis Host:<\/div>\s*<div class="info-value">([^<]+)<\/div>/);
    expect(redisHostMatch).toBeTruthy();
    expect(redisHostMatch[1].trim()).toBe('redis');

    const redisPortMatch = phpResponse.body.match(/<div class="info-label">Redis Port:<\/div>\s*<div class="info-value">([^<]+)<\/div>/);
    expect(redisPortMatch).toBeTruthy();
    expect(redisPortMatch[1].trim()).toBe('6379');

    // Verify daemon mode configuration
    expect(phpResponse.body).toContain('Events Enabled:');
    expect(phpResponse.body).toContain('false (daemon mode)');
    
    expect(phpResponse.body).toContain('LaunchDarkly API:');
    expect(phpResponse.body).toContain('Not connected (daemon mode)');
  }, 30000);

  /**
   * Requirements: 8.1, 8.2
   * Test both apps can evaluate flags successfully
   */
  test('Both applications successfully evaluate feature flags', async () => {
    // Node.js app
    const nodeResponse = await httpGet('localhost', NODE_APP_PORT, '/');
    expect(nodeResponse.statusCode).toBe(200);
    
    // Should not show "Loading..." which indicates successful flag evaluation
    const nodeMatch = nodeResponse.body.match(/<div id="message">([^<]+)<\/div>/);
    expect(nodeMatch).toBeTruthy();
    const nodeMessage = nodeMatch[1].trim();
    expect(nodeMessage).not.toBe('Loading...');

    // PHP app
    const phpResponse = await httpGet('localhost', PHP_APP_PORT, '/');
    expect(phpResponse.statusCode).toBe(200);
    
    // Should show SDK initialized successfully
    expect(phpResponse.body).toContain('SDK Initialized Successfully');
    
    // Should have a flag value (not just fallback error message)
    const phpMatch = phpResponse.body.match(/<strong>Value:<\/strong>\s*<span[^>]*>([^<]+)<\/span>/);
    expect(phpMatch).toBeTruthy();
    const phpValue = phpMatch[1].trim();
    expect(phpValue).toBeTruthy();
    expect(phpValue).not.toBe('Fallback: Error occurred');
  }, 30000);
});
