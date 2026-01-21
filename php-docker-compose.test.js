const fs = require('fs');
const yaml = require('js-yaml');

describe('PHP Service Docker Compose Configuration Unit Tests', () => {
  let dockerComposeConfig;

  beforeAll(() => {
    // Load and parse docker-compose.yml
    const dockerComposeFile = fs.readFileSync('docker-compose.yml', 'utf8');
    dockerComposeConfig = yaml.load(dockerComposeFile);
  });

  /**
   * Requirements: 1.1
   * Test php service exists in docker-compose.yml
   */
  test('PHP service exists in docker-compose.yml', () => {
    expect(dockerComposeConfig.services).toHaveProperty('php');
  });

  /**
   * Requirements: 1.3
   * Test php service uses correct build context (./php)
   */
  test('PHP service uses correct build context (./php)', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('build');
    expect(dockerComposeConfig.services.php.build).toHaveProperty('context');
    expect(dockerComposeConfig.services.php.build.context).toBe('./php');
  });

  /**
   * Requirements: 1.3
   * Test php service uses correct Dockerfile
   */
  test('PHP service uses correct Dockerfile', () => {
    expect(dockerComposeConfig.services.php.build).toHaveProperty('dockerfile');
    expect(dockerComposeConfig.services.php.build.dockerfile).toBe('Dockerfile');
  });

  /**
   * Requirements: 1.4
   * Test php service exposes port 8080:80
   */
  test('PHP service exposes port 8080:80', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('ports');
    expect(dockerComposeConfig.services.php.ports).toContain('8080:80');
  });

  /**
   * Requirements: 7.1
   * Test php service has LAUNCHDARKLY_SDK_KEY environment variable
   */
  test('PHP service has LAUNCHDARKLY_SDK_KEY environment variable', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('environment');
    const hasLdSdkKey = dockerComposeConfig.services.php.environment.some(
      env => env.startsWith('LAUNCHDARKLY_SDK_KEY=')
    );
    expect(hasLdSdkKey).toBe(true);
  });

  /**
   * Requirements: 7.2
   * Test php service has REDIS_HOST environment variable
   */
  test('PHP service has REDIS_HOST environment variable', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('environment');
    const hasRedisHost = dockerComposeConfig.services.php.environment.some(
      env => env.startsWith('REDIS_HOST=')
    );
    expect(hasRedisHost).toBe(true);
  });

  /**
   * Requirements: 7.2
   * Test php service has REDIS_PORT environment variable
   */
  test('PHP service has REDIS_PORT environment variable', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('environment');
    const hasRedisPort = dockerComposeConfig.services.php.environment.some(
      env => env.startsWith('REDIS_PORT=')
    );
    expect(hasRedisPort).toBe(true);
  });

  /**
   * Requirements: 7.3
   * Test php service has REDIS_PREFIX environment variable
   */
  test('PHP service has REDIS_PREFIX environment variable', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('environment');
    const hasRedisPrefix = dockerComposeConfig.services.php.environment.some(
      env => env.startsWith('REDIS_PREFIX=')
    );
    expect(hasRedisPrefix).toBe(true);
  });

  /**
   * Requirements: 1.5
   * Test php service is on launchdarkly-network
   */
  test('PHP service is on launchdarkly-network', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('networks');
    expect(dockerComposeConfig.services.php.networks).toContain('launchdarkly-network');
  });

  /**
   * Requirements: 5.1
   * Test php service depends on redis with health condition
   */
  test('PHP service depends on redis with health condition', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('depends_on');
    expect(dockerComposeConfig.services.php.depends_on).toHaveProperty('redis');
    expect(dockerComposeConfig.services.php.depends_on.redis).toHaveProperty('condition');
    expect(dockerComposeConfig.services.php.depends_on.redis.condition).toBe('service_healthy');
  });

  /**
   * Requirements: 5.2
   * Test php service does NOT depend on relay-proxy
   */
  test('PHP service does NOT depend on relay-proxy', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('depends_on');
    // depends_on should be an object with only redis
    expect(dockerComposeConfig.services.php.depends_on).not.toHaveProperty('relay-proxy');
    // Also check if depends_on is an array (alternative format)
    if (Array.isArray(dockerComposeConfig.services.php.depends_on)) {
      expect(dockerComposeConfig.services.php.depends_on).not.toContain('relay-proxy');
    }
  });

  /**
   * Requirements: 1.1
   * Test php service has container_name set
   */
  test('PHP service has container_name set', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('container_name');
    expect(dockerComposeConfig.services.php.container_name).toBe('php-app');
  });

  /**
   * Requirements: 7.1, 7.2, 7.3
   * Test all required environment variables are present
   */
  test('All required environment variables are present', () => {
    expect(dockerComposeConfig.services.php).toHaveProperty('environment');
    const envVars = dockerComposeConfig.services.php.environment;
    
    const hasLdSdkKey = envVars.some(env => env.startsWith('LAUNCHDARKLY_SDK_KEY='));
    const hasRedisHost = envVars.some(env => env.startsWith('REDIS_HOST='));
    const hasRedisPort = envVars.some(env => env.startsWith('REDIS_PORT='));
    const hasRedisPrefix = envVars.some(env => env.startsWith('REDIS_PREFIX='));
    
    expect(hasLdSdkKey && hasRedisHost && hasRedisPort && hasRedisPrefix).toBe(true);
  });
});
