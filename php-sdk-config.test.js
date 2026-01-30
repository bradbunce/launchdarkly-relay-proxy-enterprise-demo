const fs = require('fs');

describe('PHP SDK Configuration Unit Tests', () => {
  let composerJson;
  let indexPhpContent;

  beforeAll(() => {
    // Load composer.json
    const composerContent = fs.readFileSync('php/composer.json', 'utf8');
    composerJson = JSON.parse(composerContent);
    
    // Load index.php content
    indexPhpContent = fs.readFileSync('php/index.php', 'utf8');
  });

  /**
   * Requirements: 2.1
   * Test composer.json includes launchdarkly/server-sdk dependency
   */
  test('composer.json includes launchdarkly/server-sdk dependency', () => {
    expect(composerJson.require).toHaveProperty('launchdarkly/server-sdk');
    // Accept any version (^5.0 or ^6.0+)
    expect(composerJson.require['launchdarkly/server-sdk']).toMatch(/\^[5-9]\.\d+/);
  });

  /**
   * Requirements: 2.1
   * Test composer.json includes predis/predis dependency
   */
  test('composer.json includes predis/predis dependency', () => {
    expect(composerJson.require).toHaveProperty('predis/predis');
    expect(composerJson.require['predis/predis']).toMatch(/\^2\.0/);
  });

  /**
   * Requirements: 2.1, 2.2
   * Test PHP always initializes with Redis feature requester
   */
  test('PHP always initializes with Redis feature requester', () => {
    // Check for Redis integration usage
    expect(indexPhpContent).toMatch(/use.*LaunchDarkly.*Integrations.*Redis/);
    expect(indexPhpContent).toMatch(/Redis::featureRequester/);
    
    // Check for Redis configuration
    expect(indexPhpContent).toMatch(/REDIS_HOST/);
    expect(indexPhpContent).toMatch(/REDIS_PORT/);
    
    // Verify feature_requester is always set (no conditional logic)
    expect(indexPhpContent).toMatch(/'feature_requester'\s*=>\s*\$featureStore/);
  });

  /**
   * Requirements: 2.2, 5.2, 5.3
   * Test PHP always sends events through relay proxy
   */
  test('PHP always sends events through relay proxy', () => {
    // Check for events enabled
    expect(indexPhpContent).toMatch(/'send_events'\s*=>\s*true/);
    
    // Check for relay proxy URL configuration
    expect(indexPhpContent).toMatch(/'base_uri'\s*=>\s*\$relayProxyUrl/);
    
    // Check use_ldd is false to allow event sending
    expect(indexPhpContent).toMatch(/'use_ldd'\s*=>\s*false/);
  });

  /**
   * Requirements: 2.1, 2.3, 7.2
   * Test PHP logs "PHP SDK: Daemon Mode (Redis + Events)" on startup
   */
  test('PHP logs "PHP SDK: Daemon Mode (Redis + Events)" on startup', () => {
    // Check for the specific log message (escape parentheses in regex)
    expect(indexPhpContent).toMatch(/Daemon Mode \(Redis \+ Events\)/);
    
    // Verify the log message appears in initialization code
    expect(indexPhpContent).toMatch(/log_message.*Initializing in Daemon Mode/);
    expect(indexPhpContent).toMatch(/log_message.*initialized in Daemon Mode/);
  });

  /**
   * Requirements: 2.1, 2.2, 8.4
   * Test /api/status returns correct mode
   */
  test('/api/status endpoint returns "Daemon Mode (Redis + Events)"', () => {
    // Check that the status endpoint returns the correct mode
    expect(indexPhpContent).toMatch(/'mode'\s*=>\s*'Daemon Mode \(Redis \+ Events\)'/);
    
    // Verify there's no conditional logic for mode in status endpoint
    expect(indexPhpContent).not.toMatch(/\$useDaemonMode.*\?.*Daemon Mode.*:.*Relay Proxy Mode/);
  });

  /**
   * Requirements: 2.4, 2.5
   * Test PHP does not have USE_DAEMON_MODE environment variable check
   */
  test('PHP does not check USE_DAEMON_MODE environment variable', () => {
    // Verify USE_DAEMON_MODE is not used
    expect(indexPhpContent).not.toMatch(/USE_DAEMON_MODE/);
  });

  /**
   * Requirements: 5.1
   * Test PHP does not have relay proxy mode initialization code
   */
  test('PHP does not have relay proxy mode initialization code', () => {
    // Verify there's no conditional mode selection
    expect(indexPhpContent).not.toMatch(/if\s*\(\s*\$useDaemonMode\s*\)/);
    
    // Verify there's no "Relay Proxy Mode" initialization log
    expect(indexPhpContent).not.toMatch(/Initializing in Relay Proxy Mode/);
  });
});
