const fs = require('fs');

describe('README Documentation Completeness Unit Tests', () => {
  let readmeContent;

  beforeAll(() => {
    // Load README.md
    readmeContent = fs.readFileSync('README.md', 'utf8');
  });

  /**
   * Requirements: 7.1
   * Test README contains "Redis" section
   */
  test('README contains Redis section', () => {
    // Check for Redis heading or section
    const hasRedisSection = readmeContent.includes('## Redis') || 
                           readmeContent.includes('### Redis') ||
                           (readmeContent.includes('Redis') && readmeContent.includes('container'));
    expect(hasRedisSection).toBe(true);
  });

  /**
   * Requirements: 7.2
   * Test README contains persistence explanation
   */
  test('README contains persistence explanation', () => {
    // Check for persistence-related content
    const hasPersistenceExplanation = 
      (readmeContent.includes('persistence') || readmeContent.includes('persist')) &&
      (readmeContent.includes('AOF') || readmeContent.includes('Append-Only File') || 
       readmeContent.includes('volume') || readmeContent.includes('data'));
    expect(hasPersistenceExplanation).toBe(true);
  });

  /**
   * Requirements: 7.3
   * Test README contains connectivity verification instructions
   */
  test('README contains connectivity verification instructions', () => {
    // Check for Redis connectivity verification instructions
    const hasConnectivityInstructions = 
      readmeContent.includes('redis-cli') ||
      (readmeContent.includes('Redis') && readmeContent.includes('connect')) ||
      (readmeContent.includes('verify') && readmeContent.includes('Redis'));
    expect(hasConnectivityInstructions).toBe(true);
  });

  /**
   * Requirements: 7.4
   * Test README contains troubleshooting section
   */
  test('README contains troubleshooting section for Redis', () => {
    // Check for troubleshooting section that mentions Redis
    const hasTroubleshootingSection = 
      (readmeContent.includes('## Troubleshooting') || readmeContent.includes('### Troubleshooting')) &&
      (readmeContent.includes('Redis') || readmeContent.includes('redis'));
    expect(hasTroubleshootingSection).toBe(true);
  });

  /**
   * Requirements: 7.1
   * Test README container list includes Redis
   */
  test('README container list includes Redis', () => {
    // Check that Redis is mentioned in the containers/architecture section
    const hasRedisInContainerList = 
      (readmeContent.includes('### Containers') || readmeContent.includes('## Containers') || 
       readmeContent.includes('## Architecture')) &&
      readmeContent.includes('redis');
    expect(hasRedisInContainerList).toBe(true);
  });
});
