const fs = require('fs');

describe('PHP Dockerfile Validation Unit Tests', () => {
  let dockerfileContent;

  beforeAll(() => {
    // Load Dockerfile content
    dockerfileContent = fs.readFileSync('php/Dockerfile', 'utf8');
  });

  /**
   * Requirements: 1.2, 6.1
   * Test Dockerfile uses php:8.3-fpm-alpine base image
   */
  test('Dockerfile uses php:8.3-fpm-alpine base image', () => {
    expect(dockerfileContent).toContain('FROM php:8.3-fpm-alpine');
  });

  /**
   * Requirements: 6.1
   * Test Dockerfile installs nginx
   */
  test('Dockerfile installs nginx', () => {
    expect(dockerfileContent).toContain('nginx');
    // Verify it's installed via apk add
    expect(dockerfileContent).toMatch(/apk add[\s\S]*nginx/);
  });

  /**
   * Requirements: 1.2
   * Test Dockerfile installs composer
   */
  test('Dockerfile installs composer', () => {
    expect(dockerfileContent).toContain('composer');
    // Verify it's copied from official composer image
    expect(dockerfileContent).toMatch(/COPY --from=composer.*\/usr\/bin\/composer/);
  });

  /**
   * Requirements: 1.2
   * Test Dockerfile installs redis PHP extension
   */
  test('Dockerfile installs redis PHP extension', () => {
    expect(dockerfileContent).toContain('redis');
    // Verify it's installed via pecl
    expect(dockerfileContent).toMatch(/pecl install redis/);
    // Verify it's enabled
    expect(dockerfileContent).toMatch(/docker-php-ext-enable redis/);
  });

  /**
   * Requirements: 6.1
   * Test Dockerfile exposes port 80
   */
  test('Dockerfile exposes port 80', () => {
    expect(dockerfileContent).toContain('EXPOSE 80');
  });
});
