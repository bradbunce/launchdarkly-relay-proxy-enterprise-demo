const EventEmitter = require('events');

/**
 * ConnectionStateManager manages the current connection state and maintains a history
 * of state changes for the relay proxy connection monitoring system.
 * 
 * @extends EventEmitter
 */
class ConnectionStateManager extends EventEmitter {
  /**
   * Creates a new ConnectionStateManager instance.
   * 
   * @param {number} maxHistorySize - Maximum number of state history entries to maintain (default: 100)
   */
  constructor(maxHistorySize = 100) {
    super();
    this.currentState = 'unknown'; // 'connected', 'disconnected', 'unknown'
    this.stateHistory = [];
    this.maxHistorySize = maxHistorySize;
    this.lastStateChange = null;
  }

  /**
   * Updates the current connection state and records it in history.
   * Emits a 'state_changed' event when the state is updated.
   * 
   * @param {string} newState - The new state ('connected', 'disconnected', or 'unknown')
   * @param {Object} metadata - Additional metadata about the state change
   * @returns {Object} The history entry that was created
   */
  updateState(newState, metadata) {
    const previousState = this.currentState;
    const timestamp = new Date();

    // Update current state
    this.currentState = newState;
    this.lastStateChange = timestamp;

    // Add to history
    const historyEntry = {
      state: newState,
      timestamp: timestamp,
      metadata: {
        ...metadata,
        previousState: previousState
      }
    };

    this.stateHistory.push(historyEntry);

    // Trim history if needed (circular buffer)
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Emit state change event
    this.emit('state_changed', {
      newState: newState,
      previousState: previousState,
      timestamp: timestamp
    });

    return historyEntry;
  }

  /**
   * Initializes the connection state by querying the relay proxy status endpoint.
   * This method should be called after instantiation to detect the initial state
   * when the relay proxy is already in a stable state (connected or disconnected).
   * 
   * If the relay proxy is in "INITIALIZING" state, this method will retry the query
   * every 2-3 seconds until a stable state (VALID or INTERRUPTED) is reached or a
   * timeout of 30 seconds is exceeded.
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    const relayProxyUrl = process.env.RELAY_PROXY_URL || 'http://relay-proxy:8030';
    const maxRetries = 12; // 12 retries * 2.5s avg = 30s total
    const retryInterval = 2500; // 2.5 seconds between retries
    const maxTotalTime = 30000; // 30 seconds total timeout
    
    const startTime = Date.now();
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        // Query relay proxy status endpoint with 5-second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${relayProxyUrl}/status`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`[ConnectionStateManager] Failed to query relay proxy status: HTTP ${response.status}`);
          
          // If we're in retry mode and query fails, continue retrying
          if (retryCount > 0) {
            console.log(`[ConnectionStateManager] Query failed during retry ${retryCount}, will retry...`);
            retryCount++;
            
            // Check if we've exceeded total timeout
            if (Date.now() - startTime >= maxTotalTime) {
              console.warn('[ConnectionStateManager] Retry timeout exceeded (30s), falling back to log pattern detection');
              return;
            }
            
            await this._sleep(retryInterval);
            continue;
          }
          
          return;
        }
        
        const data = await response.json();
        
        // Parse environments[envKey].connectionStatus.state field
        if (data.environments) {
          const envKeys = Object.keys(data.environments);
          if (envKeys.length > 0) {
            const envKey = envKeys[0];
            const env = data.environments[envKey];
            
            if (env.connectionStatus && env.connectionStatus.state) {
              const relayProxyState = env.connectionStatus.state;
              
              // Check if relay proxy is in INITIALIZING state
              if (relayProxyState === 'INITIALIZING') {
                // If this is the first query, log that we're entering retry mode
                if (retryCount === 0) {
                  console.log('[ConnectionStateManager] Relay proxy is INITIALIZING, will retry until stable state is reached...');
                } else {
                  console.log(`[ConnectionStateManager] Retry ${retryCount}: Still INITIALIZING, will retry...`);
                }
                
                retryCount++;
                
                // Check if we've exceeded total timeout
                if (Date.now() - startTime >= maxTotalTime) {
                  console.warn('[ConnectionStateManager] Retry timeout exceeded (30s), falling back to log pattern detection');
                  this.updateState('unknown', {
                    detectedFrom: 'initial_status_query_timeout',
                    relayProxyState: relayProxyState,
                    environment: envKey,
                    retryCount: retryCount
                  });
                  return;
                }
                
                // Wait before retrying
                await this._sleep(retryInterval);
                continue;
              }
              
              // Map relay proxy states to internal states (stable states)
              let detectedState = 'unknown';
              if (relayProxyState === 'VALID') {
                detectedState = 'connected';
              } else if (relayProxyState === 'INTERRUPTED') {
                detectedState = 'disconnected';
              }
              
              // Update state with metadata indicating source
              this.updateState(detectedState, {
                detectedFrom: 'initial_status_query',
                relayProxyState: relayProxyState,
                environment: envKey,
                retryCount: retryCount
              });
              
              if (retryCount > 0) {
                console.log(`[ConnectionStateManager] Stable state reached after ${retryCount} retries: ${detectedState} (relay proxy state: ${relayProxyState})`);
              } else {
                console.log(`[ConnectionStateManager] Initial state detected: ${detectedState} (relay proxy state: ${relayProxyState})`);
              }
              
              return; // Exit successfully
            }
          }
        }
        
        // If we reach here, the response didn't have the expected structure
        console.warn('[ConnectionStateManager] Unexpected response structure from relay proxy status endpoint');
        return;
        
      } catch (error) {
        // Handle errors gracefully - log error and potentially retry
        if (error.name === 'AbortError') {
          console.warn('[ConnectionStateManager] Status query timeout - relay proxy did not respond within 5 seconds');
        } else {
          console.warn(`[ConnectionStateManager] Status query error: ${error.message}`);
        }
        
        // If we're in retry mode, continue retrying on errors
        if (retryCount > 0) {
          console.log(`[ConnectionStateManager] Error during retry ${retryCount}, will retry...`);
          retryCount++;
          
          // Check if we've exceeded total timeout
          if (Date.now() - startTime >= maxTotalTime) {
            console.warn('[ConnectionStateManager] Retry timeout exceeded (30s), falling back to log pattern detection');
            return;
          }
          
          await this._sleep(retryInterval);
          continue;
        }
        
        // State remains "unknown" - rely on log pattern detection as fallback
        return;
      }
    }
    
    // If we exit the loop without returning, we've exceeded max retries
    console.warn(`[ConnectionStateManager] Maximum retry attempts (${maxRetries}) exceeded, falling back to log pattern detection`);
  }
  
  /**
   * Helper method to sleep for a specified duration.
   * 
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Returns the current connection state with metadata.
   * 
   * @returns {Object} Object containing state, timestamp, and history size
   */
  getCurrentState() {
    return {
      state: this.currentState,
      timestamp: this.lastStateChange,
      historySize: this.stateHistory.length
    };
  }

  /**
   * Returns recent state change history in reverse chronological order.
   * 
   * @param {number} limit - Number of entries to return (default: 10, clamped to 1-100)
   * @returns {Array} Array of state history entries, most recent first
   */
  getStateHistory(limit = 10) {
    const clampedLimit = Math.min(Math.max(limit, 1), this.maxHistorySize);
    return this.stateHistory.slice(-clampedLimit).reverse();
  }
}

module.exports = ConnectionStateManager;
