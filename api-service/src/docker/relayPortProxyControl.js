const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const CONTAINER = 'relay-proxy';

async function stopRelayPortProxy() {
  try {
    await execPromise(`docker stop ${CONTAINER}`);
    console.log('Relay Proxy stopped — port 8030 is down for every Relay client');
    return { success: true };
  } catch (error) {
    console.error('Failed to stop Relay Proxy:', error.message);
    return { success: false, error: error.message };
  }
}

async function startRelayPortProxy() {
  try {
    await execPromise(`docker start ${CONTAINER}`);
    console.log('Relay Proxy started — port 8030 is available again');
    return { success: true };
  } catch (error) {
    console.error('Failed to start Relay Proxy:', error.message);
    return { success: false, error: error.message };
  }
}

async function getRelayPortProxyStatus() {
  try {
    const { stdout } = await execPromise(
      `docker inspect -f "{{.State.Running}}" ${CONTAINER}`
    );
    const isRunning = stdout.trim() === 'true';
    return {
      success: true,
      running: isRunning,
      open: isRunning,
      state: isRunning ? 'open' : 'killed'
    };
  } catch (error) {
    console.error('Failed to check Relay Proxy status:', error.message);
    return {
      success: false,
      error: error.message,
      running: false,
      open: false,
      state: 'unknown'
    };
  }
}

module.exports = {
  stopRelayPortProxy,
  startRelayPortProxy,
  getRelayPortProxyStatus
};
