# LaunchDarkly Hash Value Exposer - PHP

This module exposes the internal hash values that LaunchDarkly uses for percentage-based bucketing in flag evaluations. It's designed for training, demonstrations, and understanding how LaunchDarkly's bucketing mechanism works.

## Overview

LaunchDarkly uses MurmurHash3 to deterministically assign users to variations in percentage rollouts and experiments. This module provides:

- **MurmurHash3 Implementation**: The same 32-bit hash algorithm used by LaunchDarkly
- **Bucket Value Calculation**: Normalized values in the range [0, 1) used for percentage-based decisions
- **Simple API**: Easy-to-use interface for exposing hash values
- **Logging Support**: Human-readable output for demonstrations and training

## Requirements

- PHP 7.4 or higher
- Composer

## Installation

```bash
composer install
```

## Quick Start

```php
<?php

require_once __DIR__ . '/vendor/autoload.php';

use LaunchDarkly\HashValueExposer\HashValueExposer;

$exposer = new HashValueExposer();

// Basic usage
$result = $exposer->expose([
    'flagKey' => 'my-feature-flag',
    'contextKey' => 'user-12345',
    'salt' => 'experiment-1'
]);

print_r($result);
// Output:
// Array
// (
//     [flagKey] => my-feature-flag
//     [contextKey] => user-12345
//     [salt] => experiment-1
//     [hashValue] => -1234567890
//     [bucketValue] => 0.67890
// )
```

## API Reference

### HashValueExposer Class

#### `expose(array $options): array`

Calculates and returns hash values for a flag evaluation.

**Parameters:**
- `$options` (array):
  - `flagKey` (string, required): The feature flag key
  - `contextKey` (string, required): The user/context identifier
  - `salt` (string, required): The salt value (can be empty string)

**Returns:**
- Success: Array with `['flagKey', 'contextKey', 'salt', 'hashValue', 'bucketValue']`
- Error: Array with `['error', 'message', 'field']`

**Example:**
```php
$result = $exposer->expose([
    'flagKey' => 'rollout-flag',
    'contextKey' => 'user-abc',
    'salt' => 'rollout.variation.0'
]);
```

#### `exposeWithLogging(array $options): array`

Same as `expose()` but also logs the result in a human-readable format.

**Parameters:** Same as `expose()`

**Returns:** Same as `expose()`

**Example:**
```php
$result = $exposer->exposeWithLogging([
    'flagKey' => 'demo-flag',
    'contextKey' => 'user-demo',
    'salt' => 'salt-123'
]);
// Logs:
// [LaunchDarkly Hash Exposure]
// Flag Key: demo-flag
// Context Key: user-demo
// Salt: salt-123
// Hash Value: -1234567890
// Bucket Value: 0.67890
```

## Understanding Hash Values

### Hash Value
The raw 32-bit signed integer produced by MurmurHash3. This value can be positive or negative.

### Bucket Value
A normalized floating-point value in the range [0, 1) calculated using:
```
bucketValue = (abs(hashValue) % 100000) / 100000.0
```

This bucket value determines which variation a user receives in percentage rollouts:
- 0-10% rollout: Users with bucket < 0.10 get the new variation
- 0-50% rollout: Users with bucket < 0.50 get the new variation
- And so on...

## Usage Examples

### Basic Hash Calculation

```php
$exposer = new HashValueExposer();

$result = $exposer->expose([
    'flagKey' => 'my-flag',
    'contextKey' => 'user-123',
    'salt' => 'salt-abc'
]);

echo "Bucket value: {$result['bucketValue']}\n";
```

### Integration with LaunchDarkly SDK

```php
// Simulated integration - in real usage, extract salt from flag config
function demonstrateBucketing($flagKey, $context, $exposer) {
    $salt = 'rollout.variation.0'; // From flag configuration
    
    $hashInfo = $exposer->exposeWithLogging([
        'flagKey' => $flagKey,
        'contextKey' => $context['key'],
        'salt' => $salt
    ]);
    
    // Determine variation based on bucket value
    $variation = $hashInfo['bucketValue'] < 0.5 ? 'A' : 'B';
    echo "User receives variation: $variation\n";
    
    return $variation;
}
```

### Demonstrating Percentage Rollouts

```php
$users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
$rolloutPercentage = 40;

foreach ($users as $userId) {
    $result = $exposer->expose([
        'flagKey' => 'rollout-demo',
        'contextKey' => $userId,
        'salt' => 'rollout.variation.1'
    ]);
    
    $inRollout = $result['bucketValue'] < ($rolloutPercentage / 100);
    $status = $inRollout ? 'IN' : 'OUT';
    echo "{$userId}: {$status} (bucket={$result['bucketValue']})\n";
}
```

### Error Handling

```php
// Missing required parameter
$result = $exposer->expose([
    'flagKey' => 'test-flag',
    'salt' => 'test-salt'
    // contextKey is missing
]);

if (isset($result['error'])) {
    echo "Error: {$result['message']}\n";
    // Output: Error: contextKey is required and must be a non-empty string
}
```

### Custom Logger

```php
use LaunchDarkly\HashValueExposer\Logger;

// Use a custom logger function
$customLogger = function($message) {
    error_log("[CUSTOM] $message");
};

$result = $exposer->expose([
    'flagKey' => 'my-flag',
    'contextKey' => 'user-123',
    'salt' => 'salt-abc'
]);

Logger::logHashValue($result, $customLogger);
```

## Testing

Run the test suite:

```bash
composer test
```

Or using PHPUnit directly:

```bash
./vendor/bin/phpunit
```

The test suite includes:
- Unit tests with known test vectors
- Property-based tests using eris
- Cross-platform consistency tests

## Troubleshooting

### Issue: "Class not found"

**Solution:** Make sure you've run `composer install` to install dependencies and generate the autoloader.

### Issue: Hash values don't match LaunchDarkly

**Possible causes:**
1. **Incorrect salt**: Ensure you're using the correct salt from the flag configuration
2. **Wrong context key**: Verify you're using the same context key that LaunchDarkly uses
3. **String encoding**: The module uses UTF-8 encoding, which should match LaunchDarkly

### Issue: Bucket values outside [0, 1) range

**Solution:** This should never happen. If it does, please file a bug report with:
- Input values (flagKey, contextKey, salt)
- Actual bucket value received
- PHP version

### Issue: Different results between PHP and Node.js

**Solution:** Both implementations should produce identical results. If they don't:
1. Verify you're using the exact same inputs (including salt)
2. Check for string encoding issues (both use UTF-8)
3. Run the cross-platform consistency tests

### Issue: "Call to undefined function mb_strlen"

**Solution:** Install the PHP mbstring extension:
```bash
# Ubuntu/Debian
sudo apt-get install php-mbstring

# macOS with Homebrew
brew install php
# mbstring is included by default

# Windows
# Enable extension=mbstring in php.ini
```

### Issue: Property-based tests taking too long

**Solution:** Property-based tests run 100+ iterations by default. This is normal. If tests are timing out:
1. Check your PHP memory limit: `php -i | grep memory_limit`
2. Increase if needed: `php -d memory_limit=512M vendor/bin/phpunit`

## How It Works

1. **Concatenation**: Inputs are concatenated as `{flagKey}.{salt}.{contextKey}`
2. **Hashing**: The concatenated string is hashed using MurmurHash3
3. **Normalization**: The hash is normalized to a bucket value: `(abs(hash) % 100000) / 100000.0`
4. **Result**: Both the raw hash and bucket value are returned

This matches LaunchDarkly's internal bucketing algorithm, ensuring consistent results.

## Use Cases

- **Training**: Demonstrate how LaunchDarkly's bucketing works
- **Debugging**: Understand why a specific user gets a particular variation
- **Testing**: Verify bucketing behavior in your application
- **Documentation**: Create examples showing percentage rollout mechanics

## Architecture

The module follows a layered architecture:

```
HashValueExposer (API Layer)
    ↓
CalculateHashValue (Hash Calculation Layer)
    ↓
MurmurHash3 (Core Algorithm)
```

Additional components:
- **Validator**: Input validation and error handling
- **Logger**: Formatted output for demonstrations

## Cross-Platform Consistency

This PHP implementation produces identical results to the Node.js implementation when given the same inputs. Both use:
- UTF-8 string encoding
- 32-bit MurmurHash3 algorithm
- Same bucket value formula

You can verify consistency using the shared test vectors in `test-vectors.json`.

## License

MIT

## Related Documentation

- [LaunchDarkly Documentation](https://docs.launchdarkly.com/)
- [MurmurHash3 Algorithm](https://en.wikipedia.org/wiki/MurmurHash)
- [Percentage Rollouts](https://docs.launchdarkly.com/home/flags/rollouts)
- [LaunchDarkly PHP SDK](https://github.com/launchdarkly/php-server-sdk)
