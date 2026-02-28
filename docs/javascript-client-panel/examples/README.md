# JavaScript Client Panel Code Examples

This directory contains code examples and JSON samples referenced in the JavaScript Client Panel documentation.

## Files

### Context Examples

#### `anonymous-context.json`
Example of an anonymous user context used by the JavaScript Client SDK.

**Key Characteristics:**
- `anonymous: true` - Indicates this is an anonymous user
- Auto-generated key with `javascript-anon-` prefix
- Optional `location` attribute for targeting
- `kind: 'user'` - Context type (SDK v3+ format)

**Usage:**
```javascript
const anonymousContext = {
  kind: 'user',
  key: 'javascript-anon-a7f3k2',
  anonymous: true,
  location: 'San Francisco'
};

await window.jsClientSDK.identify(anonymousContext);
```

---

#### `custom-context.json`
Example of a custom user context with full user information.

**Key Characteristics:**
- `anonymous: false` - Indicates this is an identified user
- Email address used as the context key
- Optional `name` and `location` attributes
- All attributes available for targeting rules

**Usage:**
```javascript
const customContext = {
  kind: 'user',
  key: 'user@example.com',
  anonymous: false,
  email: 'user@example.com',
  name: 'Jane Doe',
  location: 'New York'
};

await window.jsClientSDK.identify(customContext);
```

---

### SDK Configuration

#### `sdk-configuration.js`
Complete example of JavaScript Client SDK initialization and usage.

**Includes:**
- SDK initialization with Proxy Mode configuration
- Configuration options explained
- Context management examples
- Flag evaluation examples
- Event listener examples

**Key Configuration Options:**
- `baseUrl`, `streamUrl`, `eventsUrl` - Relay proxy endpoints
- `streaming: true` - Enable real-time updates via SSE
- `sendEvents: false` - Disable analytics (demo mode)
- `evaluationReasons: true` - Enable bucketing information

**Usage:**
See the file for complete, runnable examples of:
- Initializing the SDK
- Changing contexts
- Evaluating flags
- Listening for flag changes

---

### Hash Information

#### `hash-information.json`
Example of bucketing hash calculation data returned by the hash calculation endpoint.

**Structure:**
- `contextKey` - User identifier used in hash calculation
- `flagKey` - Feature flag key
- `salt` - Unique salt from flag configuration
- `hashValue` - Raw SHA-1 hash result (first 60 bits as decimal)
- `bucketValue` - Normalized value (0-1) used for rollout decisions
- `explanation` - Detailed breakdown of the calculation

**Hash Algorithm:**
1. Combine: `{flagKey}.{salt}.{contextKey}`
2. Calculate SHA-1 hash
3. Extract first 15 hex characters (60 bits)
4. Convert to decimal integer
5. Divide by `0xFFFFFFFFFFFFFFF` (2^60 - 1)
6. Result is bucket value between 0 and 1

**Example Calculation:**
```
Input: user-message.94b881a3be5c449d99dbbe1a92ca3fa0.user@example.com
SHA-1: a7f3k2b8c9d1e4f5... (truncated)
First 60 bits: 1001234567890123
Bucket Value: 1001234567890123 / 1152921504606846975 = 0.85104
```

**Interpretation:**
- Bucket value `0.85104` means user is in the 85.104th percentile
- With a 50/50 rollout (0-50% vs 50-100%), user receives Variation 1
- Same context key always produces same bucket value for a given flag

**API Usage:**
```javascript
// Request hash calculation from Node.js API
const response = await fetch('http://localhost:3000/api/calculate-hash', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contextKey: 'user@example.com',
    flagKey: 'user-message'
  })
});

const data = await response.json();
console.log('Hash Info:', data.hashInfo);
// {
//   hashValue: "1001234567890123",
//   bucketValue: 0.85104,
//   salt: "94b881a3be5c449d99dbbe1a92ca3fa0"
// }
```

---

## Using These Examples

### In Documentation
Reference these examples in the documentation using relative paths:

```markdown
See [anonymous-context.json](examples/anonymous-context.json) for an example.
```

### In Code
Copy and adapt these examples for your own implementation:

```javascript
// Load and use the SDK configuration
import { initializeSDK } from './examples/sdk-configuration.js';

// Or copy the relevant code snippets directly
```

### Testing
Use these examples to test the JavaScript Client panel:

1. **Test Anonymous Context:**
   - Copy the anonymous context JSON
   - Use it in the "Change Context" modal
   - Verify flag evaluation works correctly

2. **Test Custom Context:**
   - Copy the custom context JSON
   - Use it in the "Change Context" modal
   - Verify targeting rules apply correctly

3. **Test Hash Calculation:**
   - Use the hash information example values
   - Verify your implementation produces the same results
   - Test with different context keys and flag keys

---

## Additional Resources

- [LaunchDarkly JavaScript SDK Documentation](https://docs.launchdarkly.com/sdk/client-side/javascript)
- [LaunchDarkly Relay Proxy Documentation](https://docs.launchdarkly.com/home/relay-proxy)
- [LaunchDarkly Bucketing Algorithm](https://docs.launchdarkly.com/home/flags/rollouts#understanding-percentage-rollout-logic)

---

## Notes

- All examples use SDK v3.9.0 context format (`kind: 'user'`)
- Examples assume relay proxy running on `localhost:8030`
- Hash calculations are deterministic (same input = same output)
- Context keys should be unique per user for accurate targeting
- Salt values are unique per flag and change when flag is recreated

---

## Updating Examples

When updating these examples:

1. Verify against actual implementation in `public/dashboard.html`
2. Test examples in a running instance of the dashboard
3. Update documentation references if filenames change
4. Maintain backward compatibility where possible
5. Document any breaking changes in comments
