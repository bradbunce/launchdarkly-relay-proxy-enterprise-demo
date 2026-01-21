const fs = require('fs');

describe('Nginx Configuration Unit Tests', () => {
  let nginxConfig;

  beforeAll(() => {
    // Load nginx.conf content
    nginxConfig = fs.readFileSync('php/nginx.conf', 'utf8');
  });

  /**
   * Requirements: 6.1
   * Test nginx.conf listens on port 80
   */
  test('nginx.conf listens on port 80', () => {
    expect(nginxConfig).toContain('listen 80');
  });

  /**
   * Requirements: 6.2
   * Test nginx.conf forwards .php requests to PHP-FPM
   */
  test('nginx.conf forwards .php requests to PHP-FPM', () => {
    // Check for location block that matches .php files
    expect(nginxConfig).toMatch(/location\s+~\s+\\\.php\$/);
    // Check for fastcgi_pass directive
    expect(nginxConfig).toContain('fastcgi_pass');
  });

  /**
   * Requirements: 6.2
   * Test nginx.conf uses correct fastcgi_pass (Unix socket)
   */
  test('nginx.conf uses correct fastcgi_pass (Unix socket)', () => {
    expect(nginxConfig).toContain('fastcgi_pass unix:/var/run/php-fpm.sock');
  });

  /**
   * Requirements: 6.5
   * Test nginx.conf sets correct document root
   */
  test('nginx.conf sets correct document root', () => {
    expect(nginxConfig).toContain('root /var/www/html');
  });
});
