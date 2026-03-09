const LD = require('@launchdarkly/node-server-sdk');

// Singleton instance
let ldClientInstance = null;
let flagChangeCallbacks = [];
let initializationError = null;
let inspectableStore = null; // Store reference for inspection

/**
 * Custom Feature Store Wrapper for inspecting cached flag data
 * This wraps the default in-memory store and allows us to inspect raw flag configurations
 */
class InspectableInMemoryStore {
  constructor() {
    this.data = {
      features: {},
      segments: {}
    };
    this.initialized = false;
  }

  init(allData, cb) {
    console.log('=== INITIALIZING SDK CACHE ===');
    this.data = allData || { features: {}, segments: {} };
    this.initialized = true;
    
    console.log('Flags cached:', Object.keys(this.data.features).length);
    console.log('Segments cached:', Object.keys(this.data.segments).length);
    
    if (cb) cb();
    return Promise.resolve();
  }

  get(kind, key, cb) {
    console.log(`[Store] GET called with kind:`, typeof kind, JSON.stringify(kind), `key:`, key);
    
    // Handle if kind is an object (newer SDK versions)
    const kindStr = typeof kind === 'object' ? kind.namespace : kind;
    
    const item = this.data[kindStr] ? this.data[kindStr][key] : null;
    console.log(`[Store] GET ${kindStr}/${key}:`, item ? 'found' : 'not found');
    if (cb) cb(item);
    return Promise.resolve(item);
  }

  all(kind, cb) {
    console.log(`[Store] ALL called with kind:`, typeof kind, JSON.stringify(kind));
    
    // Handle if kind is an object (newer SDK versions)
    const kindStr = typeof kind === 'object' ? kind.namespace : kind;
    
    const items = this.data[kindStr] || {};
    if (cb) cb(items);
    return Promise.resolve(items);
  }

  upsert(kind, item, cb) {
    // Handle if kind is an object (newer SDK versions)
    const kindStr = typeof kind === 'object' ? kind.namespace : kind;
    
    console.log(`=== CACHE UPDATE: ${kindStr}/${item.key} ===`);
    
    if (!this.data[kindStr]) this.data[kindStr] = {};
    this.data[kindStr][item.key] = item;
    if (cb) cb();
    return Promise.resolve();
  }

  initialized(cb) {
    if (cb) cb(this.initialized);
    return Promise.resolve(this.initialized);
  }

  close() {
    return Promise.resolve();
  }

  // Method to inspect current state
  inspect() {
    return {
      features: this.data.features,
      segments: this.data.segments
    };
  }
}

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
    console.log('Node.js SDK: Proxy Mode');
    console.log(`Relay Proxy URL: ${relayProxyUrl}`);
    
    // Create inspectable feature store
    inspectableStore = new InspectableInMemoryStore();
    
    // Standard relay proxy configuration with custom feature store
    const ldConfig = {
      baseUri: relayProxyUrl,
      streamUri: relayProxyUrl,
      eventsUri: relayProxyUrl,
      stream: true,
      sendEvents: true,
      featureStore: inspectableStore
    };

    // Initialize SDK
    const client = LD.init(sdkKey, ldConfig);

    // Store the client immediately so it can recover from connection issues
    ldClientInstance = client;
    
    // Add error handler to prevent unhandled promise rejections
    client.on('error', (error) => {
      console.error('LaunchDarkly SDK error:', error.message);
      // Don't crash the app, just log the error
      initializationError = error.message;
    });
    
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
    // However, if client creation itself failed (e.g., invalid URL), return null
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
 * Get the inspectable feature store
 * @returns {Object|null} Inspectable store instance or null if not initialized
 */
function getInspectableStore() {
  return inspectableStore;
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
  getInspectableStore,
  getInitializationError,
  onFlagChange,
  closeLaunchDarkly
};
