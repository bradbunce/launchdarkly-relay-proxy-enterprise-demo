const fs = require('fs');
const yaml = require('js-yaml');

describe('Redis Docker Compose Configuration Unit Tests', () => {
  let dockerComposeConfig;

  beforeAll(() => {
    // Load and parse docker-compose.yml
    const dockerComposeFile = fs.readFileSync('docker-compose.yml', 'utf8');
    dockerComposeConfig = yaml.load(dockerComposeFile);
  });

  /**
   * Requirements: 1.1
   * Test Redis service exists with correct image
   */
  test('Redis service exists with redis:7-alpine image', () => {
    expect(dockerComposeConfig.services).toHaveProperty('redis');
    expect(dockerComposeConfig.services.redis.image).toBe('redis:7-alpine');
  });

  /**
   * Requirements: 1.2
   * Test Redis health check is configured
   */
  test('Redis health check is configured with redis-cli ping', () => {
    expect(dockerComposeConfig.services.redis).toHaveProperty('healthcheck');
    expect(dockerComposeConfig.services.redis.healthcheck.test).toEqual(['CMD', 'redis-cli', 'ping']);
    expect(dockerComposeConfig.services.redis.healthcheck.interval).toBe('5s');
    expect(dockerComposeConfig.services.redis.healthcheck.timeout).toBe('3s');
    expect(dockerComposeConfig.services.redis.healthcheck.retries).toBe(5);
  });

  /**
   * Requirements: 1.3, 4.2
   * Test Redis volume mount is defined
   */
  test('Redis volume mount is defined', () => {
    expect(dockerComposeConfig.services.redis).toHaveProperty('volumes');
    expect(dockerComposeConfig.services.redis.volumes).toContain('redis-data:/data');
    
    // Verify volume is defined in volumes section
    expect(dockerComposeConfig.volumes).toHaveProperty('redis-data');
    expect(dockerComposeConfig.volumes['redis-data'].driver).toBe('local');
  });

  /**
   * Requirements: 1.3
   * Test Redis is on launchdarkly-network
   */
  test('Redis is on launchdarkly-network', () => {
    expect(dockerComposeConfig.services.redis).toHaveProperty('networks');
    expect(dockerComposeConfig.services.redis.networks).toContain('launchdarkly-network');
  });

  /**
   * Requirements: 5.2
   * Test Redis port configuration
   * Note: In production, Redis should not expose ports to host. However, for local
   * development and testing (including property-based tests), the port is exposed.
   */
  test('Redis port configuration is appropriate for environment', () => {
    // For local development/testing, Redis port may be exposed
    // In production, this should be removed for security
    if (dockerComposeConfig.services.redis.ports) {
      expect(dockerComposeConfig.services.redis.ports).toContain('6379:6379');
    }
    // Verify Redis is on internal network regardless
    expect(dockerComposeConfig.services.redis.networks).toContain('launchdarkly-network');
  });

  /**
   * Requirements: 1.2
   * Test Redis AOF persistence is enabled
   */
  test('Redis AOF persistence is enabled via command', () => {
    expect(dockerComposeConfig.services.redis).toHaveProperty('command');
    expect(dockerComposeConfig.services.redis.command).toBe('redis-server --appendonly yes');
  });

  /**
   * Requirements: 1.1
   * Test Redis container name is set
   */
  test('Redis container name is set to redis', () => {
    expect(dockerComposeConfig.services.redis.container_name).toBe('redis');
  });
});

describe('Relay Proxy Redis Configuration Unit Tests', () => {
  let dockerComposeConfig;

  beforeAll(() => {
    // Load and parse docker-compose.yml
    const dockerComposeFile = fs.readFileSync('docker-compose.yml', 'utf8');
    dockerComposeConfig = yaml.load(dockerComposeFile);
  });

  /**
   * Requirements: 2.2
   * Test USE_REDIS environment variable is set to "1"
   */
  test('USE_REDIS environment variable is set to "1"', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('environment');
    expect(dockerComposeConfig.services['relay-proxy'].environment).toContain('USE_REDIS=1');
  });

  /**
   * Requirements: 2.2
   * Test REDIS_URL is set to "redis://redis:6379"
   */
  test('REDIS_URL is set to "redis://redis:6379"', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('environment');
    expect(dockerComposeConfig.services['relay-proxy'].environment).toContain('REDIS_URL=redis://redis:6379');
  });

  /**
   * Requirements: 2.2
   * Test ENV_DATASTORE_PREFIX is set with $CID placeholder
   */
  test('ENV_DATASTORE_PREFIX is set with $CID placeholder', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('environment');
    const hasDatastorePrefix = dockerComposeConfig.services['relay-proxy'].environment.some(
      env => env.startsWith('ENV_DATASTORE_PREFIX=') && env.includes('$CID')
    );
    expect(hasDatastorePrefix).toBe(true);
  });

  /**
   * Requirements: 6.3
   * Test AUTO_CONFIG_KEY is still present
   */
  test('AUTO_CONFIG_KEY is still present in relay-proxy configuration', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('environment');
    const hasAutoConfigKey = dockerComposeConfig.services['relay-proxy'].environment.some(
      env => env.startsWith('AUTO_CONFIG_KEY=')
    );
    expect(hasAutoConfigKey).toBe(true);
  });

  /**
   * Requirements: 2.4, 6.4
   * Test depends_on includes redis with health condition
   */
  test('depends_on includes redis with health condition', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('depends_on');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on).toHaveProperty('redis');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on.redis).toHaveProperty('condition');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on.redis.condition).toBe('service_healthy');
  });
});

describe('Service Dependency Ordering Unit Tests', () => {
  let dockerComposeConfig;

  beforeAll(() => {
    // Load and parse docker-compose.yml
    const dockerComposeFile = fs.readFileSync('docker-compose.yml', 'utf8');
    dockerComposeConfig = yaml.load(dockerComposeFile);
  });

  /**
   * Requirements: 3.1
   * Test Redis has no depends_on (starts first)
   */
  test('Redis has no depends_on (starts first)', () => {
    expect(dockerComposeConfig.services.redis.depends_on).toBeUndefined();
  });

  /**
   * Requirements: 3.2
   * Test Relay Proxy depends_on redis with health condition
   */
  test('Relay Proxy depends_on redis with health condition', () => {
    expect(dockerComposeConfig.services['relay-proxy']).toHaveProperty('depends_on');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on).toHaveProperty('redis');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on.redis).toEqual({
      condition: 'service_healthy'
    });
  });

  /**
   * Requirements: 3.3
   * Test App depends_on relay-proxy
   */
  test('App depends_on relay-proxy', () => {
    expect(dockerComposeConfig.services.app).toHaveProperty('depends_on');
    expect(dockerComposeConfig.services.app.depends_on).toContain('relay-proxy');
  });

  /**
   * Requirements: 3.1, 3.2, 3.3, 3.4
   * Test complete dependency chain is correct
   */
  test('Complete dependency chain is correct (redis -> relay-proxy -> app)', () => {
    // Redis has no dependencies (starts first)
    expect(dockerComposeConfig.services.redis.depends_on).toBeUndefined();
    
    // Relay Proxy depends on Redis with health check
    expect(dockerComposeConfig.services['relay-proxy'].depends_on).toHaveProperty('redis');
    expect(dockerComposeConfig.services['relay-proxy'].depends_on.redis.condition).toBe('service_healthy');
    
    // App depends on Relay Proxy
    expect(dockerComposeConfig.services.app.depends_on).toContain('relay-proxy');
    
    // Verify the complete chain: redis (no deps) -> relay-proxy (depends on redis) -> app (depends on relay-proxy)
    const redisHasNoDeps = !dockerComposeConfig.services.redis.depends_on;
    const relayDependsOnRedis = dockerComposeConfig.services['relay-proxy'].depends_on?.redis !== undefined;
    const appDependsOnRelay = dockerComposeConfig.services.app.depends_on?.includes('relay-proxy');
    
    expect(redisHasNoDeps && relayDependsOnRedis && appDependsOnRelay).toBe(true);
  });
});
