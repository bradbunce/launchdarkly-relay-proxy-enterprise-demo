/**
 * Application configuration with environment variable validation
 */

/**
 * Get configuration value from environment with optional default
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Default value if not set
 * @param {boolean} required - Whether the variable is required
 * @returns {string} Configuration value
 */
function getConfig(key, defaultValue = null, required = false) {
  const value = process.env[key];
  
  if (!value && required) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return value || defaultValue;
}

/**
 * Validate and load application configuration
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const config = {
    // LaunchDarkly SDK configuration
    launchDarkly: {
      sdkKey: getConfig('LAUNCHDARKLY_SDK_KEY', null, false),
      relayProxyUrl: getConfig('RELAY_PROXY_URL', 'http://relay-proxy:8030', false)
    },
    
    // Application configuration
    app: {
      port: parseInt(getConfig('PORT', '3000', false), 10)
    }
  };

  // Validate port number
  if (isNaN(config.app.port) || config.app.port < 1 || config.app.port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535`);
  }

  // Log configuration (without sensitive values)
  console.log('Configuration loaded:');
  console.log(`  Port: ${config.app.port}`);
  console.log(`  Relay Proxy URL: ${config.launchDarkly.relayProxyUrl}`);
  console.log(`  SDK Key: ${config.launchDarkly.sdkKey ? '[SET]' : '[NOT SET]'}`);

  return config;
}

module.exports = { loadConfig };
