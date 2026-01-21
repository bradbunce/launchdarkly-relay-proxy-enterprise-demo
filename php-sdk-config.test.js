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
    expect(composerJson.require['launchdarkly/server-sdk']).toMatch(/\^5\.0/);
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
   * Test SDK initialization code uses Redis feature store
   */
  test('SDK initialization code uses Redis feature store', () => {
    // Check for Redis integration usage
    expect(indexPhpContent).toMatch(/use.*LaunchDarkly.*Integrations.*Redis/);
    expect(indexPhpContent).toMatch(/Redis::featureRequester/);
    
    // Check for Redis configuration
    expect(indexPhpContent).toMatch(/redis_host/);
    expect(indexPhpContent).toMatch(/redis_port/);
  });

  /**
   * Requirements: 2.2, 2.6
   * Test SDK initialization code sets use_ldd to true
   */
  test('SDK initialization code sets use_ldd to true', () => {
    // Check for daemon mode flag
    expect(indexPhpContent).toMatch(/'use_ldd'\s*=>\s*true/);
  });

  /**
   * Requirements: 2.6
   * Test SDK initialization code sets send_events to false
   */
  test('SDK initialization code sets send_events to false', () => {
    // Check for events disabled in daemon mode
    expect(indexPhpContent).toMatch(/'send_events'\s*=>\s*false/);
  });
});
