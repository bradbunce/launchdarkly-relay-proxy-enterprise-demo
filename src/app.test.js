const request = require('supertest');
const { createApp } = require('./app');

describe('Node App After Refactoring', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  /**
   * Unit Test: Dashboard endpoints were removed
   * Validates: Requirement 9.2 - Node app removes dashboard serving
   */
  test('GET / no longer redirects to dashboard', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(404);
  });

  test('GET /dashboard was removed', async () => {
    const response = await request(app).get('/dashboard');
    expect(response.status).toBe(404);
  });

  /**
   * Unit Test: SDK endpoints still work
   * Validates: Requirement 9.3 - Node app retains SDK endpoints
   */
  test('/api/sdk-config returns Relay Proxy Mode', async () => {
    const response = await request(app).get('/api/sdk-config');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('mode');
    expect(response.body.mode).toBe('Relay Proxy Mode');
  });

  test('/api/node/status endpoint exists', async () => {
    const response = await request(app).get('/api/node/status');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('connected');
    expect(response.body).toHaveProperty('mode');
    expect(response.body.mode).toBe('Relay Proxy Mode');
  });

  test('/api/message endpoint exists', async () => {
    const response = await request(app).get('/api/message');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
  });

  /**
   * Requirements: 1.1, 3.1
   * Test /api/sdk-config does not include useDaemonMode field
   */
  test('/api/sdk-config does not include useDaemonMode field', async () => {
    const response = await request(app).get('/api/sdk-config');
    
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('useDaemonMode');
  });

  /**
   * Requirements: 1.1, 3.1, 4.1
   * Test /api/sdk-config does not include Redis configuration fields
   */
  test('/api/sdk-config does not include Redis configuration fields', async () => {
    const response = await request(app).get('/api/sdk-config');
    
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('redisHost');
    expect(response.body).not.toHaveProperty('redisPort');
    expect(response.body).not.toHaveProperty('redisPrefix');
  });

  /**
   * Requirements: 1.1, 8.3
   * Test /api/sdk-config includes relayProxyUrl
   */
  test('/api/sdk-config includes relayProxyUrl', async () => {
    const response = await request(app).get('/api/sdk-config');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('relayProxyUrl');
    expect(typeof response.body.relayProxyUrl).toBe('string');
    expect(response.body.relayProxyUrl).toBeTruthy();
  });

  /**
   * Requirements: 1.1, 3.1
   * Test /api/sdk-config response structure is simplified
   */
  test('/api/sdk-config response structure is simplified', async () => {
    const response = await request(app).get('/api/sdk-config');
    
    expect(response.status).toBe(200);
    
    // Should only have mode and relayProxyUrl
    const keys = Object.keys(response.body);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('mode');
    expect(keys).toContain('relayProxyUrl');
  });
});
