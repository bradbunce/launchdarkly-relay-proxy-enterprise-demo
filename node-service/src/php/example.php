<?php

/**
 * Example usage of HashValueExposer API
 * Demonstrates how to expose LaunchDarkly bucketing hash values
 */

require_once __DIR__ . '/vendor/autoload.php';

use LaunchDarkly\HashValueExposer\HashValueExposer;
use LaunchDarkly\HashValueExposer\Logger;

// Create an instance of HashValueExposer
$exposer = new HashValueExposer();

echo "=== Example 1: Basic Hash Calculation ===\n\n";

// Basic usage - expose hash value without logging
$result1 = $exposer->expose([
    'flagKey' => 'my-feature-flag',
    'contextKey' => 'user-12345',
    'salt' => 'experiment-1'
]);

echo "Result:\n";
print_r($result1);
echo "Explanation: This shows the raw hash value and normalized bucket value (0-1)\n\n";

echo "=== Example 2: Using exposeWithLogging() for Demonstrations ===\n\n";

// With logging - automatically logs the result in a readable format
$result2 = $exposer->exposeWithLogging([
    'flagKey' => 'rollout-flag',
    'contextKey' => 'user-67890',
    'salt' => 'rollout-salt'
]);

echo "\nReturned result:\n";
print_r($result2);
echo "Explanation: Use this method during training sessions to show hash calculations\n\n";

echo "=== Example 3: Integration with LaunchDarkly SDK ===\n\n";

// Simulated LaunchDarkly SDK integration
// In a real scenario, you would use the actual LaunchDarkly PHP SDK
// This example shows how to expose hash values during flag evaluation

function simulateFlagEvaluation($flagKey, $context, $exposer) {
    // In a real implementation, you would:
    // 1. Get the flag configuration from LaunchDarkly
    // 2. Extract the salt from the flag's rollout/experiment configuration
    // 3. Use the context key for bucketing
    
    // For this example, we'll use a simulated salt
    $salt = 'rollout.variation.0'; // Typical LaunchDarkly salt format
    
    // Expose the hash value to understand bucketing
    $hashInfo = $exposer->exposeWithLogging([
        'flagKey' => $flagKey,
        'contextKey' => $context['key'],
        'salt' => $salt
    ]);
    
    echo "\nBucket value {$hashInfo['bucketValue']} determines which variation the user receives\n";
    
    // Simulate variation assignment based on bucket value
    // If bucket < 0.5, user gets variation A, otherwise variation B
    $variation = $hashInfo['bucketValue'] < 0.5 ? 'A' : 'B';
    echo "User receives variation: $variation\n";
    
    return ['variation' => $variation, 'hashInfo' => $hashInfo];
}

// Example context (similar to LaunchDarkly context structure)
$userContext = [
    'kind' => 'user',
    'key' => 'user-demo-123',
    'name' => 'Demo User',
    'email' => 'demo@example.com'
];

echo "Evaluating flag for user: {$userContext['key']}\n";
$evaluation = simulateFlagEvaluation('percentage-rollout-flag', $userContext, $exposer);
echo "\n";

echo "=== Example 4: Demonstrating Consistent Bucketing ===\n\n";

// Show that the same user always gets the same bucket value
echo "Demonstrating that hash values are deterministic:\n";
for ($i = 0; $i < 3; $i++) {
    $result = $exposer->expose([
        'flagKey' => 'consistent-flag',
        'contextKey' => 'user-consistent',
        'salt' => 'salt-123'
    ]);
    echo "Attempt " . ($i + 1) . ": Bucket value = {$result['bucketValue']}\n";
}
echo "Notice: All three attempts produce the same bucket value\n\n";

echo "=== Example 5: Handling Validation Errors ===\n\n";

// Invalid input - missing contextKey
$result3 = $exposer->expose([
    'flagKey' => 'test-flag',
    'salt' => 'test-salt'
]);

echo "Error result:\n";
print_r($result3);
echo "Explanation: The API validates inputs and returns descriptive errors\n\n";

echo "=== Example 6: Empty Salt (Valid Use Case) ===\n\n";

// Empty salt is valid - some flags may not use a salt
$result4 = $exposer->expose([
    'flagKey' => 'flag-with-empty-salt',
    'contextKey' => 'user-abc',
    'salt' => ''
]);

echo "Result with empty salt:\n";
print_r($result4);
echo "Explanation: Empty salt is valid and produces a different hash than no salt\n\n";

echo "=== Example 7: Unicode Characters ===\n\n";

// Unicode characters work correctly
$result5 = $exposer->expose([
    'flagKey' => 'international-flag-🌍',
    'contextKey' => 'user-你好',
    'salt' => 'salt-مرحبا'
]);

echo "Result with Unicode:\n";
print_r($result5);
echo "Explanation: The hash function correctly handles international characters\n\n";

echo "=== Example 8: Understanding Percentage Rollouts ===\n\n";

// Demonstrate how bucket values map to percentage rollouts
$testUsers = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
$rolloutPercentage = 40; // 40% rollout

echo "Simulating a {$rolloutPercentage}% rollout:\n";
$usersInRollout = 0;

foreach ($testUsers as $userId) {
    $result = $exposer->expose([
        'flagKey' => 'rollout-demo',
        'contextKey' => $userId,
        'salt' => 'rollout.variation.1'
    ]);
    
    $inRollout = $result['bucketValue'] < ($rolloutPercentage / 100);
    if ($inRollout) $usersInRollout++;
    
    $bucketFormatted = number_format($result['bucketValue'], 5);
    $status = $inRollout ? 'IN' : 'OUT';
    echo "{$userId}: bucket={$bucketFormatted} -> {$status}\n";
}

echo "\nResult: {$usersInRollout}/" . count($testUsers) . " users in rollout\n";
echo "Explanation: Users with bucket < 0.40 are included in the 40% rollout\n\n";

echo "=== Example 9: Using Logger directly with custom logger ===\n\n";

// You can also use the Logger class directly with a custom logger function
$customLogger = function($message) {
    echo "[CUSTOM] $message\n";
};

Logger::logHashValue($result1, $customLogger);
