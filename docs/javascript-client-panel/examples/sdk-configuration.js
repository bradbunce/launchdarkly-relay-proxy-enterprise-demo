/**
 * JavaScript Client SDK Configuration Example
 * 
 * This example shows how the JavaScript Client panel initializes the
 * LaunchDarkly JavaScript Client-Side SDK v3.9.0 in Proxy Mode.
 */

// Client-side ID from LaunchDarkly environment
const clientSideId = '6980ccadb17af909dd9c4abb';

// Generate a unique anonymous user key
const randomId = Math.random().toString(36).substring(7);

// Initialize the SDK with an anonymous context
window.jsClientSDK = window.LDClient.initialize(clientSideId, {
  kind: 'user',
  key: `javascript-anon-${randomId}`,
  anonymous: true
}, {
  // Proxy Mode Configuration
  // All endpoints point to the relay proxy instead of LaunchDarkly directly
  baseUrl: 'http://localhost:8030',      // Relay proxy endpoint for flag data
  streamUrl: 'http://localhost:8030',    // Relay proxy endpoint for streaming updates
  eventsUrl: 'http://localhost:8030',    // Relay proxy endpoint for analytics events
  
  // Streaming Configuration
  streaming: true,                        // Enable real-time flag updates via SSE
  
  // Analytics Configuration
  sendEvents: false,                      // Disable analytics events (demo mode)
  diagnosticOptOut: true,                 // Disable diagnostic events
  
  // Evaluation Configuration
  evaluationReasons: true                 // Enable evaluation reasons for bucketing info
});

// Wait for SDK initialization (with 5 second timeout)
await window.jsClientSDK.waitForInitialization(5);

console.log('JavaScript Client SDK initialized and ready');

/**
 * Configuration Options Explained:
 * 
 * baseUrl: The relay proxy endpoint for fetching flag configurations.
 *          In production, this would be your relay proxy URL.
 * 
 * streamUrl: The relay proxy endpoint for Server-Sent Events (SSE) streaming.
 *            Enables real-time flag updates without polling.
 * 
 * eventsUrl: The relay proxy endpoint for sending analytics events.
 *            Disabled in this demo to prevent analytics noise.
 * 
 * streaming: When true, the SDK maintains a persistent SSE connection
 *            to receive flag updates instantly. When false, the SDK
 *            would need to poll for updates.
 * 
 * sendEvents: When false, the SDK doesn't send analytics events to
 *             LaunchDarkly. Useful for demo/testing environments.
 * 
 * diagnosticOptOut: When true, disables diagnostic events that help
 *                   LaunchDarkly monitor SDK health. Disabled in demo.
 * 
 * evaluationReasons: When true, the SDK includes evaluation reasons
 *                    in flag evaluations, which provides bucketing
 *                    information for percentage rollouts.
 */

/**
 * Example: Changing Context
 * 
 * To change the user context (e.g., switching from anonymous to custom),
 * use the identify() method:
 */
async function changeToCustomContext() {
  const newContext = {
    kind: 'user',
    key: 'user@example.com',
    anonymous: false,
    email: 'user@example.com',
    name: 'Jane Doe',
    location: 'New York'
  };
  
  await window.jsClientSDK.identify(newContext);
  console.log('Context changed to custom user');
}

/**
 * Example: Evaluating a Flag
 * 
 * To get the current value of a feature flag:
 */
function evaluateFlag() {
  const flagValue = window.jsClientSDK.variation('user-message', 'default value');
  console.log('Flag value:', flagValue);
  return flagValue;
}

/**
 * Example: Getting All Flags
 * 
 * To retrieve all flag values from the SDK's cache:
 */
function getAllFlags() {
  const allFlags = window.jsClientSDK.allFlags();
  console.log('All flags:', allFlags);
  return allFlags;
}

/**
 * Example: Listening for Flag Changes
 * 
 * To react when a flag value changes:
 */
window.jsClientSDK.on('change:user-message', (newValue, oldValue) => {
  console.log(`Flag 'user-message' changed from '${oldValue}' to '${newValue}'`);
});

/**
 * Example: Listening for All Flag Changes
 * 
 * To react when any flag changes:
 */
window.jsClientSDK.on('change', (changes) => {
  console.log('Flags changed:', changes);
});
