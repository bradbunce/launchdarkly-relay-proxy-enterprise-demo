const LD = require('@launchdarkly/node-server-sdk');

// Singleton instance
let ldClientInstance = null;
let flagChangeCallbacks = [];
let initializationError = null;

/**
 * Initialize LaunchDarkly SDK client as a singleton
 * @param {Object} config - LaunchDarkly configuration object
 * @param {string} config.sdkKey - LaunchDarkly SDK key
 * @param {string} config.relayProxyUrl - Relay proxy URL
 * @returns {Promise<Object>} Initialized LaunchDarkly client or null on failure
 */
async function initializeLaunchDarkly(config) {
  // Return existing instance if already initialized
  if (ldClientInstance) {
    console.log('LaunchDarkly SDK already initialized, returning existing instance');
    return ldClientInstance;
  }

  const { sdkKey, relayProxyUrl } = config;

  // Validate SDK key
  if (!sdkKey) {
    const errorMsg = 'LAUNCHDARKLY_SDK_KEY not provided. SDK will not be initialized.';
    console.warn(errorMsg);
    initializationError = errorMsg;
    return null;
  }

  try {
    console.log('Initializing LaunchDarkly SDK...');
    console.log(`Relay Proxy URL: ${relayProxyUrl}`);

    // Initialize SDK with relay proxy configuration
    const client = LD.init(sdkKey, {
      baseUri: relayProxyUrl,
      streamUri: relayProxyUrl,
      eventsUri: relayProxyUrl
    });

    // Store the client immediately so it can recover from connection issues
    ldClientInstance = client;
    
    // Set up flag change listener
    client.on('update', async (settings) => {
      console.log('=== LaunchDarkly Flag Change Detected ===');
      console.log('Changed flags:', Object.keys(settings));
      
      // Fetch current flag values to show what changed
      try {
        const context = {
          kind: 'user',
          key: 'system-check',
          anonymous: true
        };
        
        const flagState = await client.allFlagsState(context);
        const allFlags = flagState.allValues();
        
        console.log('Current flag values:');
        Object.keys(settings).forEach(flagKey => {
          if (allFlags[flagKey] !== undefined) {
            console.log(`  - ${flagKey}: "${allFlags[flagKey]}"`);
          }
        });
      } catch (error) {
        console.error('Error fetching flag details:', error);
      }
      
      console.log('=========================================');
      
      // Clear initialization error on successful update
      initializationError = null;
      // Notify all registered callbacks
      flagChangeCallbacks.forEach(callback => callback(settings));
    });

    // Wait for SDK to be ready (with 5 second timeout)
    await client.waitForInitialization({ timeout: 5 });
    console.log('LaunchDarkly SDK initialized successfully');
    initializationError = null;
    
    return client;
  } catch (error) {
    const errorMsg = `Failed to initialize LaunchDarkly SDK: ${error.message}`;
    console.error(errorMsg);
    console.warn('Application will continue with SDK in offline mode');
    initializationError = errorMsg;
    
    // Return the client even though initialization timed out
    // It will continue retrying in the background
    return ldClientInstance;
  }
}

/**
 * Get the LaunchDarkly client instance
 * @returns {Object|null} LaunchDarkly client instance or null if not initialized
 */
function getLaunchDarklyClient() {
  if (!ldClientInstance) {
    console.warn('LaunchDarkly SDK not initialized. Call initializeLaunchDarkly() first.');
  }
  return ldClientInstance;
}

/**
 * Get the initialization error if any
 * @returns {string|null} Error message or null if no error
 */
function getInitializationError() {
  return initializationError;
}

/**
 * Register a callback for flag changes
 * @param {Function} callback - Function to call when flags change
 */
function onFlagChange(callback) {
  flagChangeCallbacks.push(callback);
}

/**
 * Close the LaunchDarkly client and reset singleton
 * @returns {Promise<void>}
 */
async function closeLaunchDarkly() {
  if (ldClientInstance) {
    try {
      // Flush pending events before closing
      await ldClientInstance.flush();
      console.log('LaunchDarkly events flushed');
    } catch (error) {
      console.error('Error flushing LaunchDarkly events:', error);
    }
    
    await ldClientInstance.close();
    ldClientInstance = null;
    flagChangeCallbacks = [];
    initializationError = null;
    console.log('LaunchDarkly SDK closed');
  }
}

module.exports = { 
  initializeLaunchDarkly, 
  getLaunchDarklyClient,
  getInitializationError,
  onFlagChange,
  closeLaunchDarkly
};
