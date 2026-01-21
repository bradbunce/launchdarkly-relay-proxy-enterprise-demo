const request = require('supertest');
const fc = require('fast-check');
const { createApp } = require('./app');

describe('HTTP Response Property Tests', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  /**
   * Feature: launchdarkly-demo-app, Property 1: HTTP Response Contains Message
   * Validates: Requirements 1.1, 1.2, 1.3
   * 
   * Property: For any HTTP request to the root endpoint, the response should contain 
   * valid HTML with a message element that displays content from the server.
   */
  test('Property 1: HTTP Response Contains Message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // We're testing the same endpoint repeatedly
        async () => {
          // Make HTTP request to root endpoint
          const response = await request(app).get('/');

          // Verify response status is 200 (successful)
          expect(response.status).toBe(200);

          // Verify response contains HTML content
          expect(response.headers['content-type']).toMatch(/html/);

          // Verify response body is valid HTML
          expect(response.text).toBeTruthy();
          expect(response.text.length).toBeGreaterThan(0);

          // Verify HTML contains the message element with id="message"
          expect(response.text).toMatch(/<div[^>]*id=["']message["'][^>]*>/);

          // Verify the message element contains content (not empty)
          const messageMatch = response.text.match(/<div[^>]*id=["']message["'][^>]*>([^<]+)<\/div>/);
          expect(messageMatch).toBeTruthy();
          expect(messageMatch[1].trim()).toBeTruthy();
          expect(messageMatch[1].trim().length).toBeGreaterThan(0);

          // Verify HTML structure contains required elements
          expect(response.text).toMatch(/<html/i);
          expect(response.text).toMatch(/<body/i);
          expect(response.text).toMatch(/<\/html>/i);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });
});

describe('Route Handler Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  /**
   * Unit Test: GET / returns 200 status
   * Validates: Requirements 1.2
   */
  test('GET / returns 200 status', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });

  /**
   * Unit Test: Response contains HTML content
   * Validates: Requirements 1.2
   */
  test('Response contains HTML content', async () => {
    const response = await request(app).get('/');
    
    // Verify content-type header indicates HTML
    expect(response.headers['content-type']).toMatch(/html/);
    
    // Verify response body contains HTML structure
    expect(response.text).toContain('<!DOCTYPE html>');
    expect(response.text).toContain('<html>');
    expect(response.text).toContain('</html>');
    expect(response.text).toContain('<body>');
    expect(response.text).toContain('</body>');
  });
});

describe('HTML Structure Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  /**
   * Unit Test: HTML contains required elements (title, message div)
   * Validates: Requirements 1.3, 1.4
   */
  test('HTML contains required elements (title, message div)', async () => {
    const response = await request(app).get('/');
    
    // Verify HTML contains title element
    expect(response.text).toMatch(/<title>.*<\/title>/);
    expect(response.text).toContain('LaunchDarkly Demo');
    
    // Verify HTML contains message div with id="message"
    expect(response.text).toMatch(/<div[^>]*id=["']message["'][^>]*>/);
    
    // Verify HTML contains h1 element
    expect(response.text).toMatch(/<h1>.*<\/h1>/);
    expect(response.text).toContain('LaunchDarkly Relay Proxy Enterprise Demo');
    
    // Verify HTML contains main-container div
    expect(response.text).toMatch(/<div[^>]*class=["']main-container["'][^>]*>/);
  });

  /**
   * Unit Test: Default message is "Loading..."
   * Validates: Requirements 1.3, 1.4
   */
  test('Default message is "Loading..."', async () => {
    const response = await request(app).get('/');
    
    // Extract the message div content
    const messageMatch = response.text.match(/<div[^>]*id=["']message["'][^>]*>([^<]+)<\/div>/);
    
    // Verify message div exists and contains "Loading..."
    expect(messageMatch).toBeTruthy();
    expect(messageMatch[1].trim()).toBe('Loading...');
  });
});
