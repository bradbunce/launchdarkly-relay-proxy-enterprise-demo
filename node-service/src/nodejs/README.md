# LaunchDarkly Hash Value Exposer - Node.js

This module exposes the internal hash values that LaunchDarkly uses for percentage-based bucketing in flag evaluations. It's designed for training, demonstrations, and understanding how LaunchDarkly's bucketing mechanism works.

## Overview

LaunchDarkly uses MurmurHash3 to deterministically assign users to variations in percentage rollouts and experiments. This module provides:

- **MurmurHash3 Implementation**: The same 32-bit hash algorithm used by LaunchDarkly
- **Bucket Value Calculation**: Normalized values in the range [0, 1) used for percentage-based decisions
- **Simple API**: Easy-to-use interface for exposing hash values
- **Logging Support**: Human-readable output for demonstrations and training

## Installation

```bash
npm install
```

## Quick Start

```javascript
import { HashValueExposer } from './src/HashValueExposer.js';

const exposer = new HashValueExposer();

// Basic usage
const result = exposer.expose({
  flagKey: 'my-feature-flag',
  contextKey: 'user-12345',
  salt: 'experiment-1'
});

console.log(result);
// Output:
// {
//   flagKey: 'my-feature-flag',
//   contextKey: 'user-12345',
//   salt: 'experiment-1',
//   hashValue: -1234567890,
//   bucketValue: 0.67890
// }
```

## API Reference

### HashValueExposer Class

#### `expose(options)`

Calculates and returns hash values for a flag evaluation.

**Parameters:**
- `options` (Object):
  - `flagKey` (string, required): The feature flag key
  - `contextKey` (string, required): The user/context identifier
  - `salt` (string, required): The salt value (can be empty string)

**Returns:**
- Success: Object with `{ flagKey, contextKey, salt, hashValue, bucketValue }`
- Error: Object with `{ error, message, field }`

**Example:**
```javascript
const result = exposer.expose({
  flagKey: 'rollout-flag',
  contextKey: 'user-abc',
  salt: 'rollout.variation.0'
});
```

#### `exposeWithLogging(options)`

Same as `expose()` but also logs the result in a human-readable format.

**Parameters:** Same as `expose()`

**Returns:** Same as `expose()`

**Example:**
```javascript
const result = exposer.exposeWithLogging({
  flagKey: 'demo-flag',
  contextKey: 'user-demo',
  salt: 'salt-123'
});
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

```javascript
const exposer = new HashValueExposer();

const result = exposer.expose({
  flagKey: 'my-flag',
  contextKey: 'user-123',
  salt: 'salt-abc'
});

console.log(`Bucket value: ${result.bucketValue}`);
```

### Integration with LaunchDarkly SDK

```javascript
// Simulated integration - in real usage, extract salt from flag config
function demonstrateBucketing(flagKey, context) {
  const salt = 'rollout.variation.0'; // From flag configuration
  
  const hashInfo = exposer.exposeWithLogging({
    flagKey: flagKey,
    contextKey: context.key,
    salt: salt
  });
  
  // Determine variation based on bucket value
  const variation = hashInfo.bucketValue < 0.5 ? 'A' : 'B';
  console.log(`User receives variation: ${variation}`);
  
  return variation;
}
```

### Demonstrating Percentage Rollouts

```javascript
const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
const rolloutPercentage = 40;

users.forEach(userId => {
  const result = exposer.expose({
    flagKey: 'rollout-demo',
    contextKey: userId,
    salt: 'rollout.variation.1'
  });
  
  const inRollout = result.bucketValue < (rolloutPercentage / 100);
  console.log(`${userId}: ${inRollout ? 'IN' : 'OUT'} (bucket=${result.bucketValue})`);
});
```

### Error Handling

```javascript
// Missing required parameter
const result = exposer.expose({
  flagKey: 'test-flag',
  salt: 'test-salt'
  // contextKey is missing
});

if (result.error) {
  console.error(`Error: ${result.message}`);
  // Output: Error: contextKey is required and must be a non-empty string
}
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

The test suite includes:
- Unit tests with known test vectors
- Property-based tests using fast-check
- Cross-platform consistency tests

## Troubleshooting

### Issue: "Cannot find module"

**Solution:** Make sure you've run `npm install` to install dependencies.

### Issue: Hash values don't match LaunchDarkly

**Possible causes:**
1. **Incorrect salt**: Ensure you're using the correct salt from the flag configuration
2. **Wrong context key**: Verify you're using the same context key that LaunchDarkly uses
3. **String encoding**: The module uses UTF-8 encoding, which should match LaunchDarkly

### Issue: Bucket values outside [0, 1) range

**Solution:** This should never happen. If it does, please file a bug report with:
- Input values (flagKey, contextKey, salt)
- Actual bucket value received
- Node.js version

### Issue: Different results between Node.js and PHP

**Solution:** Both implementations should produce identical results. If they don't:
1. Verify you're using the exact same inputs (including salt)
2. Check for string encoding issues (both use UTF-8)
3. Run the cross-platform consistency tests

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

## Requirements

- Node.js 14.x or higher
- ES6 module support

## License

MIT

## Related Documentation

- [LaunchDarkly Documentation](https://docs.launchdarkly.com/)
- [MurmurHash3 Algorithm](https://en.wikipedia.org/wiki/MurmurHash)
- [Percentage Rollouts](https://docs.launchdarkly.com/home/flags/rollouts)
