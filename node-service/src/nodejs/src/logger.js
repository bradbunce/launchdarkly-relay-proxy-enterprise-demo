/**
 * Logger module for LaunchDarkly Hash Value Exposure
 * Formats and outputs hash values for demonstrations
 * 
 * Requirements: 6.1, 6.2
 */

/**
 * Logs hash value results in a human-readable format
 * @param {Object} result - Result object containing hash information
 * @param {string} result.flagKey - Feature flag key
 * @param {string} result.contextKey - User/context identifier
 * @param {string} result.salt - Salt value
 * @param {number} result.hashValue - Raw 32-bit hash value
 * @param {number} result.bucketValue - Normalized bucket value [0, 1)
 */
export function logHashValue(result) {
  console.log('[LaunchDarkly Hash Exposure]');
  console.log(`Flag Key: ${result.flagKey}`);
  console.log(`Context Key: ${result.contextKey}`);
  console.log(`Salt: ${result.salt}`);
  console.log(`Hash Value: ${result.hashValue}`);
  console.log(`Bucket Value: ${result.bucketValue}`);
}
