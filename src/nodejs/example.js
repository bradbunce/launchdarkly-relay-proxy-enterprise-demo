/**
 * Example usage of HashValueExposer API
 * Demonstrates how to expose LaunchDarkly bucketing hash values
 */

import { HashValueExposer } from './src/HashValueExposer.js';

// Create an instance of HashValueExposer
const exposer = new HashValueExposer();

console.log('=== Example 1: Basic Hash Calculation ===\n');

// Basic usage - expose hash value without logging
const result1 = exposer.expose({
  flagKey: 'my-feature-flag',
  contextKey: 'user-12345',
  salt: 'experiment-1'
});

console.log('Result:', result1);
console.log('Explanation: This shows the raw hash value and normalized bucket value (0-1)');
console.log();

console.log('=== Example 2: Using exposeWithLogging() for Demonstrations ===\n');

// With logging - automatically logs the result in a readable format
const result2 = exposer.exposeWithLogging({
  flagKey: 'rollout-flag',
  contextKey: 'user-67890',
  salt: 'rollout-salt'
});

console.log('\nReturned result:', result2);
console.log('Explanation: Use this method during training sessions to show hash calculations');
console.log();

console.log('=== Example 3: Integration with LaunchDarkly SDK ===\n');

// Simulated LaunchDarkly SDK integration
// In a real scenario, you would use the actual LaunchDarkly SDK
// This example shows how to expose hash values during flag evaluation

const simulateFlagEvaluation = (flagKey, context) => {
  // In a real implementation, you would:
  // 1. Get the flag configuration from LaunchDarkly
  // 2. Extract the salt from the flag's rollout/experiment configuration
  // 3. Use the context key for bucketing
  
  // For this example, we'll use a simulated salt
  const salt = 'rollout.variation.0'; // Typical LaunchDarkly salt format
  
  // Expose the hash value to understand bucketing
  const hashInfo = exposer.exposeWithLogging({
    flagKey: flagKey,
    contextKey: context.key,
    salt: salt
  });
  
  console.log(`\nBucket value ${hashInfo.bucketValue} determines which variation the user receives`);
  
  // Simulate variation assignment based on bucket value
  // If bucket < 0.5, user gets variation A, otherwise variation B
  const variation = hashInfo.bucketValue < 0.5 ? 'A' : 'B';
  console.log(`User receives variation: ${variation}`);
  
  return { variation, hashInfo };
};

// Example context (similar to LaunchDarkly context structure)
const userContext = {
  kind: 'user',
  key: 'user-demo-123',
  name: 'Demo User',
  email: 'demo@example.com'
};

console.log('Evaluating flag for user:', userContext.key);
const evaluation = simulateFlagEvaluation('percentage-rollout-flag', userContext);
console.log();

console.log('=== Example 4: Demonstrating Consistent Bucketing ===\n');

// Show that the same user always gets the same bucket value
console.log('Demonstrating that hash values are deterministic:');
for (let i = 0; i < 3; i++) {
  const result = exposer.expose({
    flagKey: 'consistent-flag',
    contextKey: 'user-consistent',
    salt: 'salt-123'
  });
  console.log(`Attempt ${i + 1}: Bucket value = ${result.bucketValue}`);
}
console.log('Notice: All three attempts produce the same bucket value');
console.log();

console.log('=== Example 5: Handling Validation Errors ===\n');

// Invalid input - missing contextKey
const result3 = exposer.expose({
  flagKey: 'test-flag',
  salt: 'test-salt'
});

console.log('Error result:', result3);
console.log('Explanation: The API validates inputs and returns descriptive errors');
console.log();

console.log('=== Example 6: Empty Salt (Valid Use Case) ===\n');

// Empty salt is valid - some flags may not use a salt
const result4 = exposer.expose({
  flagKey: 'flag-with-empty-salt',
  contextKey: 'user-abc',
  salt: ''
});

console.log('Result with empty salt:', result4);
console.log('Explanation: Empty salt is valid and produces a different hash than no salt');
console.log();

console.log('=== Example 7: Unicode Characters ===\n');

// Unicode characters work correctly
const result5 = exposer.expose({
  flagKey: 'international-flag-🌍',
  contextKey: 'user-你好',
  salt: 'salt-مرحبا'
});

console.log('Result with Unicode:', result5);
console.log('Explanation: The hash function correctly handles international characters');
console.log();

console.log('=== Example 8: Understanding Percentage Rollouts ===\n');

// Demonstrate how bucket values map to percentage rollouts
const testUsers = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
const rolloutPercentage = 40; // 40% rollout

console.log(`Simulating a ${rolloutPercentage}% rollout:`);
let usersInRollout = 0;

testUsers.forEach(userId => {
  const result = exposer.expose({
    flagKey: 'rollout-demo',
    contextKey: userId,
    salt: 'rollout.variation.1'
  });
  
  const inRollout = result.bucketValue < (rolloutPercentage / 100);
  if (inRollout) usersInRollout++;
  
  console.log(`${userId}: bucket=${result.bucketValue.toFixed(5)} -> ${inRollout ? 'IN' : 'OUT'}`);
});

console.log(`\nResult: ${usersInRollout}/${testUsers.length} users in rollout`);
console.log('Explanation: Users with bucket < 0.40 are included in the 40% rollout');
