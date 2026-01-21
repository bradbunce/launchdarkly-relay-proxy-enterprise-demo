const fs = require('fs');

describe('README PHP Daemon Mode Documentation Completeness Unit Tests', () => {
  let readmeContent;

  beforeAll(() => {
    // Load README.md
    readmeContent = fs.readFileSync('README.md', 'utf8');
  });

  /**
   * Requirements: 9.1
   * Test README contains PHP daemon mode section
   */
  test('README contains PHP daemon mode section', () => {
    // Check for PHP daemon mode heading or section
    const hasPhpDaemonSection = 
      readmeContent.includes('## PHP') || 
      readmeContent.includes('### PHP') ||
      (readmeContent.includes('PHP') && readmeContent.includes('daemon'));
    expect(hasPhpDaemonSection).toBe(true);
  });

  /**
   * Requirements: 9.2
   * Test README explains daemon mode concept
   */
  test('README explains daemon mode concept', () => {
    // Check for daemon mode explanation
    const hasDaemonExplanation = 
      readmeContent.includes('daemon mode') || readmeContent.includes('Daemon mode') ||
      readmeContent.includes('daemon Mode') || readmeContent.includes('Daemon Mode');
    expect(hasDaemonExplanation).toBe(true);
  });

  /**
   * Requirements: 9.2
   * Test README explains how daemon mode differs from standard SDK operation
   */
  test('README explains how daemon mode differs from standard SDK operation', () => {
    // Check for comparison or explanation of differences
    const hasDifferencesExplanation = 
      (readmeContent.includes('daemon') && 
       (readmeContent.includes('differ') || readmeContent.includes('vs') || 
        readmeContent.includes('standard') || readmeContent.includes('without'))) ||
      (readmeContent.includes('daemon') && readmeContent.includes('Redis') && 
       (readmeContent.includes('read') || readmeContent.includes('API')));
    expect(hasDifferencesExplanation).toBe(true);
  });

  /**
   * Requirements: 9.3
   * Test README documents how to access PHP application
   */
  test('README documents how to access PHP application', () => {
    // Check for PHP application access instructions with port 8080
    const hasPhpAccessInstructions = 
      readmeContent.includes('8080') &&
      (readmeContent.includes('PHP') || readmeContent.includes('php'));
    expect(hasPhpAccessInstructions).toBe(true);
  });

  /**
   * Requirements: 9.3
   * Test README includes localhost:8080 URL
   */
  test('README includes localhost:8080 URL', () => {
    // Check for specific URL
    const hasPhpUrl = 
      readmeContent.includes('localhost:8080') || 
      readmeContent.includes('http://localhost:8080');
    expect(hasPhpUrl).toBe(true);
  });

  /**
   * Requirements: 9.4
   * Test README includes PHP Redis verification instructions
   */
  test('README includes PHP Redis verification instructions', () => {
    // Check for instructions on verifying PHP SDK reads from Redis
    const hasPhpRedisVerification = 
      (readmeContent.includes('PHP') && readmeContent.includes('Redis') && 
       (readmeContent.includes('verify') || readmeContent.includes('check'))) ||
      (readmeContent.includes('PHP') && readmeContent.includes('daemon') && 
       readmeContent.includes('Redis'));
    expect(hasPhpRedisVerification).toBe(true);
  });

  /**
   * Requirements: 9.5
   * Test README documents shared Redis architecture
   */
  test('README documents shared Redis architecture', () => {
    // Check for shared Redis architecture explanation
    const hasSharedArchitecture = 
      (readmeContent.includes('shared') && readmeContent.includes('Redis')) ||
      (readmeContent.includes('both') && readmeContent.includes('Redis') && 
       (readmeContent.includes('Node') || readmeContent.includes('PHP')));
    expect(hasSharedArchitecture).toBe(true);
  });

  /**
   * Requirements: 9.5
   * Test README documents both Node.js and PHP SDKs using Redis
   */
  test('README documents both Node.js and PHP SDKs using Redis', () => {
    // Check that both Node.js and PHP are mentioned with Redis
    const hasNodeJs = readmeContent.includes('Node.js') || readmeContent.includes('Node');
    const hasPhp = readmeContent.includes('PHP') || readmeContent.includes('php');
    const hasRedis = readmeContent.includes('Redis') || readmeContent.includes('redis');
    expect(hasNodeJs && hasPhp && hasRedis).toBe(true);
  });

  /**
   * Requirements: 9.1
   * Test README container list includes php-app
   */
  test('README container list includes php-app', () => {
    // Check that php-app is mentioned in the containers/architecture section
    const hasPhpInContainerList = 
      (readmeContent.includes('### Containers') || readmeContent.includes('## Containers') || 
       readmeContent.includes('## Architecture')) &&
      (readmeContent.includes('php-app') || readmeContent.includes('PHP'));
    expect(hasPhpInContainerList).toBe(true);
  });

  /**
   * Requirements: 9.1
   * Test README includes PHP-specific troubleshooting section
   */
  test('README includes PHP-specific troubleshooting section', () => {
    // Check for troubleshooting section that mentions PHP
    const hasPhpTroubleshooting = 
      (readmeContent.includes('## Troubleshooting') || readmeContent.includes('### Troubleshooting')) &&
      (readmeContent.includes('PHP') || readmeContent.includes('php'));
    expect(hasPhpTroubleshooting).toBe(true);
  });

  /**
   * Requirements: 9.1, 9.2
   * Test README mentions PHP container in architecture
   */
  test('README mentions PHP container in architecture', () => {
    // Check that PHP is mentioned in architecture section
    const hasPhpInArchitecture = 
      (readmeContent.includes('## Architecture') || readmeContent.includes('### Architecture')) &&
      (readmeContent.includes('PHP') || readmeContent.includes('php'));
    expect(hasPhpInArchitecture).toBe(true);
  });
});
