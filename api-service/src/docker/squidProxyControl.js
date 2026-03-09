const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

/**
 * Stop the squid-proxy container
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function stopSquidProxy() {
  try {
    await execPromise('docker stop squid-proxy');
    console.log('Squid proxy stopped successfully');
    return { success: true };
  } catch (error) {
    console.error('Failed to stop squid proxy:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Start the squid-proxy container
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function startSquidProxy() {
  try {
    await execPromise('docker start squid-proxy');
    console.log('Squid proxy started successfully');
    return { success: true };
  } catch (error) {
    console.error('Failed to start squid proxy:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get the status of the squid-proxy container
 * @returns {Promise<{success: boolean, running?: boolean, state?: string, error?: string}>}
 */
async function getSquidProxyStatus() {
  try {
    const { stdout } = await execPromise(
      'docker inspect -f "{{.State.Running}}" squid-proxy'
    );
    const isRunning = stdout.trim() === 'true';
    return { 
      success: true, 
      running: isRunning,
      state: isRunning ? 'connected' : 'disconnected'
    };
  } catch (error) {
    console.error('Failed to check squid proxy status:', error.message);
    return { 
      success: false, 
      error: error.message,
      state: 'unknown'
    };
  }
}

module.exports = {
  stopSquidProxy,
  startSquidProxy,
  getSquidProxyStatus
};
