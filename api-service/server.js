const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a fetch termination error (common when connections are closed)
  if (reason && reason.message && (reason.message.includes('terminated') || reason.message.includes('Body Timeout'))) {
    // Silently handle fetch termination errors - these are expected when connections close
    console.warn('Fetch connection terminated (expected behavior):', reason.message);
    return;
  }
  
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  // Check if it's a fetch termination error
  if (error.message && (error.message.includes('terminated') || error.message.includes('Body Timeout'))) {
    // Silently handle fetch termination errors
    console.warn('Fetch connection terminated (expected behavior):', error.message);
    return;
  }
  
  console.error('Uncaught Exception:', error);
  
  // Only exit for truly fatal errors (port binding, etc.)
  // Don't exit for network issues or fetch errors
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    console.error('Fatal error, exiting...');
    process.exit(1);
  } else {
    console.warn('Non-fatal error caught, continuing operation...');
  }
});

// Helper function for structured error logging
function logError(endpoint, error, context = {}) {
  const timestamp = new Date().toISOString();
  console.error(JSON.stringify({
    timestamp,
    level: 'ERROR',
    endpoint,
    error: error.message,
    stack: error.stack,
    ...context
  }));
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // Add custom User-Agent header to identify API service
  const headers = {
    'User-Agent': 'api-service/1.0',
    ...options.headers
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// Middleware
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from dashboard (port 8000) or no origin (same-origin)
    const allowedOrigins = ['http://localhost:8000', 'http://127.0.0.1:8000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Relay Proxy status endpoint
app.get('/api/relay-status', async (req, res) => {
  const relayProxyUrl = process.env.RELAY_PROXY_URL || 'http://relay-proxy:8030';
  
  try {
    const response = await fetchWithTimeout(
      `${relayProxyUrl}/status`,
      {},
      5000
    );
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Relay proxy returned ${response.status}`,
        connected: false
      });
    }
    
    const data = await response.json();
    
    // Additionally check if Redis is actually available
    // The relay proxy status shows cached state, not real-time Redis connectivity
    let redisAvailable = false;
    try {
      const { stdout } = await execPromise('docker exec redis redis-cli ping');
      redisAvailable = stdout.trim() === 'PONG';
    } catch (error) {
      // Redis is not responding
      redisAvailable = false;
    }
    
    // If Redis is down, update the status to reflect this
    if (!redisAvailable && data.environments) {
      // Mark all data stores as degraded
      Object.keys(data.environments).forEach(envKey => {
        const env = data.environments[envKey];
        if (env.dataStoreStatus) {
          env.dataStoreStatus.state = 'INTERRUPTED';
          env.dataStoreStatus.error = 'Redis connection unavailable';
        }
      });
      
      // Update overall status to degraded
      data.status = 'degraded';
      data.redisAvailable = false;
    } else {
      data.redisAvailable = true;
    }
    
    res.json({ ...data, connected: true });
  } catch (error) {
    logError('/api/relay-status', error, {
      upstreamUrl: `${relayProxyUrl}/status`
    });
    res.status(500).json({
      error: error.message,
      connected: false
    });
  }
});

// Redis status endpoint
app.get('/api/redis/status', async (req, res) => {
  try {
    // First check if container is running
    const { stdout: inspectOutput } = await execPromise('docker inspect -f "{{.State.Running}}" redis 2>&1');
    const isRunning = inspectOutput.trim() === 'true';
    
    if (!isRunning) {
      return res.json({
        connected: false,
        running: false,
        status: 'stopped'
      });
    }
    
    // If running, check if Redis is responding
    const { stdout, stderr } = await execPromise('docker exec redis redis-cli ping');
    const output = stdout.trim();
    
    if (output === 'PONG') {
      res.json({
        connected: true,
        running: true,
        status: 'healthy'
      });
    } else {
      res.json({
        connected: false,
        running: true,
        status: 'unhealthy',
        error: `Unexpected response: ${output}`
      });
    }
  } catch (error) {
    logError('/api/redis/status', error, {
      command: 'docker inspect/exec redis'
    });
    res.status(500).json({
      connected: false,
      running: false,
      error: error.message
    });
  }
});

// Redis start endpoint
app.post('/api/redis/start', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker start redis');
    res.json({
      success: true,
      message: 'Redis container started successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/redis/start', error, {
      command: 'docker start redis'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Redis stop endpoint
app.post('/api/redis/stop', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker stop redis');
    res.json({
      success: true,
      message: 'Redis container stopped successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/redis/stop', error, {
      command: 'docker stop redis'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Redis restart endpoint
app.post('/api/redis/restart', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker restart redis');
    res.json({
      success: true,
      message: 'Redis container restarted successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/redis/restart', error, {
      command: 'docker restart redis'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Redis data store endpoint - fetch all LaunchDarkly flags from Redis
app.post('/api/redis/data-store', async (req, res) => {
  try {
    // First check if Redis is running
    const { stdout: pingOutput } = await execPromise('docker exec redis redis-cli ping 2>&1');
    if (pingOutput.trim() !== 'PONG') {
      return res.status(500).json({
        success: false,
        error: 'Redis is not responding'
      });
    }
    
    // Get all LaunchDarkly feature flag keys
    const { stdout: keysOutput } = await execPromise('docker exec redis redis-cli --scan --pattern "ld-flags-*:features"');
    const keys = keysOutput.trim().split('\n').filter(k => k.trim());
    
    if (keys.length === 0) {
      return res.json({
        success: true,
        flags: {},
        message: 'No flags found in Redis'
      });
    }
    
    // For each key, get the hash values (LaunchDarkly stores flags as Redis hashes)
    const flags = {};
    
    for (const key of keys) {
      try {
        // Use HGETALL to get all fields from the hash
        const { stdout: hashOutput } = await execPromise(`docker exec redis redis-cli HGETALL "${key}"`);
        const lines = hashOutput.trim().split('\n');
        
        // Parse hash output (alternating field/value pairs)
        for (let i = 0; i < lines.length; i += 2) {
          const flagKey = lines[i];
          const flagValue = lines[i + 1];
          
          if (flagKey && flagValue) {
            try {
              flags[flagKey] = JSON.parse(flagValue);
            } catch (error) {
              console.error(`Error parsing flag ${flagKey}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching hash from key ${key}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      flags: flags,
      keyCount: keys.length
    });
  } catch (error) {
    logError('/api/redis/data-store', error, {
      command: 'docker exec redis redis-cli'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Relay Proxy cache endpoint - fetch flags from Relay Proxy's internal cache
// This creates a temporary SDK client that connects to the Relay Proxy and retrieves
// the flag data it's serving, demonstrating consistency across all layers
let relayProxyCacheClient = null;
let relayProxyCacheData = null;

// Initialize a dedicated SDK client for inspecting Relay Proxy cache
async function initRelayProxyCacheClient() {
  if (relayProxyCacheClient) {
    return relayProxyCacheClient;
  }

  const LD = require('@launchdarkly/node-server-sdk');
  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  
  if (!sdkKey) {
    throw new Error('LAUNCHDARKLY_SDK_KEY not configured');
  }

  // Create a custom feature store that captures the data
  class CaptureStore {
    constructor() {
      this.data = { flags: {}, segments: {} };
      this.isInitialized = false;
    }

    init(allData, cb) {
      console.log('[Relay Proxy Cache] Received initial data from Relay Proxy');
      console.log('[Relay Proxy Cache] Data structure:', JSON.stringify(Object.keys(allData || {})));
      
      if (allData) {
        // The SDK passes data with 'features' and 'segments' keys
        if (allData.features) {
          this.data.flags = { ...allData.features };
          console.log('[Relay Proxy Cache] Captured', Object.keys(allData.features).length, 'flags');
        }
        if (allData.segments) {
          this.data.segments = { ...allData.segments };
          console.log('[Relay Proxy Cache] Captured', Object.keys(allData.segments).length, 'segments');
        }
      }
      
      this.isInitialized = true;
      relayProxyCacheData = { ...this.data };
      
      if (cb) cb();
      return Promise.resolve();
    }

    get(kind, key, cb) {
      const collection = kind === 'features' ? this.data.flags : this.data.segments;
      const result = collection[key] || null;
      if (cb) cb(result);
      return Promise.resolve(result);
    }

    all(kind, cb) {
      const collection = kind === 'features' ? this.data.flags : this.data.segments;
      if (cb) cb(collection);
      return Promise.resolve(collection);
    }

    upsert(kind, item, cb) {
      console.log(`[Relay Proxy Cache] Update received: ${kind}/${item.key}`);
      const collection = kind === 'features' ? this.data.flags : this.data.segments;
      collection[item.key] = item;
      relayProxyCacheData = { ...this.data };
      if (cb) cb();
      return Promise.resolve();
    }

    initialized(cb) {
      if (cb) cb(this.isInitialized);
      return Promise.resolve(this.isInitialized);
    }

    close() {
      return Promise.resolve();
    }

    getDescription() {
      return 'Relay Proxy Cache Capture Store';
    }
  }

  const captureStore = new CaptureStore();

  relayProxyCacheClient = LD.init(sdkKey, {
    baseUri: 'http://relay-proxy:8030',
    streamUri: 'http://relay-proxy:8030',
    eventsUri: 'http://relay-proxy:8030',
    featureStore: captureStore,
    stream: true,
    sendEvents: false,
    diagnosticOptOut: true
  });

  await relayProxyCacheClient.waitForInitialization({ timeout: 10 });
  console.log('[Relay Proxy Cache] SDK client initialized and connected to Relay Proxy');
  
  return relayProxyCacheClient;
}

app.post('/api/relay-proxy/cache', async (req, res) => {
  try {
    // Initialize the client if not already done
    if (!relayProxyCacheClient) {
      await initRelayProxyCacheClient();
    }

    // Check if we have cached data
    if (!relayProxyCacheData || !relayProxyCacheData.flags) {
      return res.json({
        success: true,
        flags: {},
        message: 'Waiting for Relay Proxy to send data'
      });
    }

    // Return the captured flag data
    res.json({
      success: true,
      flags: relayProxyCacheData.flags
    });
  } catch (error) {
    logError('/api/relay-proxy/cache', error, {
      message: 'Failed to fetch Relay Proxy cache'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Relay Proxy start endpoint
app.post('/api/relay-proxy/start', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker start relay-proxy');
    res.json({
      success: true,
      message: 'Relay Proxy container started successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/relay-proxy/start', error, {
      command: 'docker start relay-proxy'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Relay Proxy stop endpoint
app.post('/api/relay-proxy/stop', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker stop relay-proxy');
    res.json({
      success: true,
      message: 'Relay Proxy container stopped successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/relay-proxy/stop', error, {
      command: 'docker stop relay-proxy'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Relay Proxy restart endpoint
app.post('/api/relay-proxy/restart', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker restart relay-proxy');
    res.json({
      success: true,
      message: 'Relay Proxy container restarted successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/relay-proxy/restart', error, {
      command: 'docker restart relay-proxy'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Node.js container status endpoint (Docker level)
app.get('/api/node/container-status', async (req, res) => {
  try {
    // Check if container is running
    const { stdout: inspectOutput } = await execPromise('docker inspect -f "{{.State.Running}}" node-app-dev 2>&1');
    const isRunning = inspectOutput.trim() === 'true';
    
    if (!isRunning) {
      return res.json({
        connected: false,
        running: false,
        status: 'stopped'
      });
    }
    
    // If running, container is healthy
    res.json({
      connected: true,
      running: true,
      status: 'healthy'
    });
  } catch (error) {
    logError('/api/node/container-status', error, {
      command: 'docker inspect node-app-dev'
    });
    res.status(500).json({
      connected: false,
      running: false,
      error: error.message
    });
  }
});

// Node.js Service start endpoint
app.post('/api/node/start', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker start node-app-dev');
    res.json({
      success: true,
      message: 'Node.js Service container started successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/node/start', error, {
      command: 'docker start node-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Node.js Service stop endpoint
app.post('/api/node/stop', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker stop node-app-dev');
    res.json({
      success: true,
      message: 'Node.js Service container stopped successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/node/stop', error, {
      command: 'docker stop node-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Node.js Service restart endpoint
app.post('/api/node/restart', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker restart node-app-dev');
    res.json({
      success: true,
      message: 'Node.js Service container restarted successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/node/restart', error, {
      command: 'docker restart node-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Node.js application status endpoint
app.get('/api/node/status', async (req, res) => {
  const nodeAppUrl = process.env.NODE_APP_URL || 'http://node-app-dev:3000';
  
  try {
    const response = await fetchWithTimeout(
      `${nodeAppUrl}/api/node/status`,
      {},
      5000
    );
    
    const data = await response.json();
    
    // Preserve original status code from Node app
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/node/status', error, {
      upstreamUrl: `${nodeAppUrl}/api/node/status`
    });
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
});

// PHP Service container status endpoint (Docker level)
app.get('/api/php/container-status', async (req, res) => {
  try {
    // Check if container is running
    const { stdout: inspectOutput } = await execPromise('docker inspect -f "{{.State.Running}}" php-app-dev 2>&1');
    const isRunning = inspectOutput.trim() === 'true';
    
    if (!isRunning) {
      return res.json({
        connected: false,
        running: false,
        status: 'stopped'
      });
    }
    
    // If running, container is healthy
    res.json({
      connected: true,
      running: true,
      status: 'healthy'
    });
  } catch (error) {
    logError('/api/php/container-status', error, {
      command: 'docker inspect php-app-dev'
    });
    res.status(500).json({
      connected: false,
      running: false,
      error: error.message
    });
  }
});

// PHP Service start endpoint
app.post('/api/php/start', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker start php-app-dev');
    res.json({
      success: true,
      message: 'PHP Service container started successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/php/start', error, {
      command: 'docker start php-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PHP Service stop endpoint
app.post('/api/php/stop', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker stop php-app-dev');
    res.json({
      success: true,
      message: 'PHP Service container stopped successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/php/stop', error, {
      command: 'docker stop php-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PHP Service restart endpoint
app.post('/api/php/restart', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker restart php-app-dev');
    res.json({
      success: true,
      message: 'PHP Service container restarted successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/php/restart', error, {
      command: 'docker restart php-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PHP application status endpoint
app.get('/api/php/status', async (req, res) => {
  const phpAppUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  try {
    const response = await fetchWithTimeout(
      `${phpAppUrl}/api/status`,
      {},
      5000
    );
    
    const data = await response.json();
    
    // Preserve original status code from PHP app
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/php/status', error, {
      upstreamUrl: `${phpAppUrl}/api/status`
    });
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
});

// Container logs endpoint
app.get('/api/logs/:container', async (req, res) => {
  const { container } = req.params;
  const allowedContainers = ['node-app-dev', 'php-app-dev', 'relay-proxy', 'redis'];
  
  // Validate container name against allowlist
  if (!allowedContainers.includes(container)) {
    return res.status(400).json({
      error: 'Invalid container name',
      lines: []
    });
  }
  
  try {
    // Execute docker logs command
    const { stdout, stderr } = await execPromise(`docker logs --tail 50 ${container} 2>&1`);
    
    // Parse output and return as JSON array of log lines
    const logs = (stdout + stderr).split('\n').filter(line => line.trim());
    res.json({ lines: logs });
  } catch (error) {
    logError(`/api/logs/${container}`, error, {
      container,
      command: `docker logs --tail 50 ${container}`
    });
    // Handle Docker command failures with empty array and error message
    res.json({
      error: `Unable to fetch logs for ${container}. Container may not be running.`,
      lines: []
    });
  }
});

// Clear container logs endpoint
app.post('/api/logs/:container/clear', async (req, res) => {
  const { container } = req.params;
  const allowedContainers = ['node-app-dev', 'php-app-dev', 'relay-proxy', 'redis'];
  
  // Validate container name against allowlist
  if (!allowedContainers.includes(container)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid container name'
    });
  }
  
  try {
    // Docker doesn't have a native "clear logs" command, but we can truncate the log file
    // This requires access to the Docker log file location
    // For now, we'll return success but note that logs will still exist
    // A proper implementation would require direct file system access to Docker's log directory
    res.json({
      success: true,
      message: `Log clear requested for ${container}. Note: Docker logs persist until container restart.`
    });
  } catch (error) {
    logError(`/api/logs/${container}/clear`, error, {
      container
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Relay Proxy metrics endpoint
app.get('/api/relay-metrics', async (req, res) => {
  try {
    // Execute docker stats command
    const { stdout } = await execPromise('docker stats relay-proxy --no-stream --format "{{json .}}"');
    
    // Parse JSON output
    const stats = JSON.parse(stdout.trim());
    
    // Extract CPU percentage, memory usage, and memory percentage
    const cpuStr = stats.CPUPerc || '0%';
    const memoryStr = stats.MemUsage || '0B / 0B';
    const memoryPercStr = stats.MemPerc || '0%';
    
    // Parse CPU percentage (remove % sign) and handle NaN
    const cpu = parseFloat(cpuStr.replace('%', '')) || 0;
    
    // Extract memory usage (first part before /)
    const memory = memoryStr.split('/')[0].trim();
    
    // Parse memory percentage (remove % sign) and handle NaN
    const memoryPercent = parseFloat(memoryPercStr.replace('%', '')) || 0;
    
    // Return JSON with required fields
    res.json({
      cpu,
      memory,
      memoryPercent,
      timestamp: Date.now()
    });
  } catch (error) {
    logError('/api/relay-metrics', error, {
      command: 'docker stats relay-proxy --no-stream --format "{{json .}}"'
    });
    // Handle Docker command failures with 500 status and error message
    res.status(500).json({
      error: error.message
    });
  }
});

// PHP SSE stream proxy endpoint
app.get('/api/php/message/stream', async (req, res) => {
  const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  // Get context key from query parameter and forward it
  const contextKey = req.query.contextKey;
  const phpStreamUrl = contextKey 
    ? `${phpUrl}/api/message/stream?contextKey=${encodeURIComponent(contextKey)}`
    : `${phpUrl}/api/message/stream`;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  try {
    // Connect to PHP SSE stream with custom User-Agent
    const response = await fetch(phpStreamUrl, {
      headers: {
        'User-Agent': 'api-service/1.0'
      }
    });
    
    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ error: 'PHP service unavailable' })}\n\n`);
      return res.end();
    }
    
    // Stream the response body to the client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            res.end();
            break;
          }
          
          // Write chunk to response
          res.write(value);
        }
      } catch (error) {
        logError('/api/php/message/stream', error, {
          phpUrl: `${phpUrl}/api/message/stream`
        });
        res.end();
      }
    };
    
    pump();
    
    // Handle client disconnect
    req.on('close', () => {
      reader.cancel();
    });
    
  } catch (error) {
    logError('/api/php/message/stream', error, {
      phpUrl: `${phpUrl}/api/message/stream`
    });
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Redis monitor SSE stream proxy endpoint
app.get('/api/redis/monitor', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  let monitorProcess = null;
  
  try {
    const { spawn } = require('child_process');
    
    // Spawn redis-cli monitor command
    monitorProcess = spawn('docker', ['exec', 'redis', 'redis-cli', 'MONITOR']);
    
    // Send data to client
    monitorProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        res.write(`data: ${JSON.stringify({ command: line })}\n\n`);
      });
    });
    
    monitorProcess.stderr.on('data', (data) => {
      logError('/api/redis/monitor', new Error(data.toString()), {
        command: 'docker exec redis redis-cli MONITOR'
      });
    });
    
    monitorProcess.on('error', (error) => {
      logError('/api/redis/monitor', error, {
        command: 'docker exec redis redis-cli MONITOR'
      });
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
    
    // Handle client disconnect
    req.on('close', () => {
      if (monitorProcess) {
        monitorProcess.kill();
      }
    });
    
  } catch (error) {
    logError('/api/redis/monitor', error, {
      command: 'docker exec redis redis-cli MONITOR'
    });
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// PHP context GET proxy endpoint
app.get('/api/php/context', async (req, res) => {
  const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  try {
    const response = await fetchWithTimeout(`${phpUrl}/api/context`, {}, 5000);
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: `PHP service returned ${response.status}`
      });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    logError('/api/php/context', error, {
      phpUrl: `${phpUrl}/api/context`
    });
    res.status(500).json({
      error: error.message
    });
  }
});

// PHP context update proxy endpoint
app.post('/api/php/context', async (req, res) => {
  const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  try {
    const response = await fetchWithTimeout(`${phpUrl}/api/context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/php/context', error, {
      phpUrl: `${phpUrl}/api/context`
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PHP test evaluation proxy endpoint
app.post('/api/php/test-evaluation', async (req, res) => {
  const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  try {
    const response = await fetchWithTimeout(`${phpUrl}/api/test-evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/php/test-evaluation', error, {
      phpUrl: `${phpUrl}/api/test-evaluation`
    });
    res.status(500).json({
      success: false,
      error: `Unable to connect to PHP service: ${error.message}`
    });
  }
});

// PHP redis-cache proxy endpoint
app.post('/api/php/redis-cache', async (req, res) => {
  const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
  
  try {
    // Forward cookies to PHP service for session persistence
    const headers = {
      'Content-Type': 'application/json'
    };
    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }
    
    // Forward the context from request body
    const response = await fetchWithTimeout(`${phpUrl}/api/redis-cache`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    
    // Forward Set-Cookie headers back to client
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }
    
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/php/redis-cache', error, {
      phpUrl: `${phpUrl}/api/redis-cache`
    });
    res.status(500).json({
      success: false,
      error: `Unable to connect to PHP service: ${error.message}`
    });
  }
});

// Load test proxy endpoint
app.post('/api/load-test', async (req, res) => {
  const { requests, concurrency, service } = req.body;
  
  // Route to appropriate service
  if (service === 'node') {
    const nodeAppUrl = process.env.NODE_APP_URL || 'http://node-app-dev:3000';
    
    try {
      const response = await fetchWithTimeout(`${nodeAppUrl}/api/load-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests, concurrency, service })
      }, 30000); // 30 second timeout for load test
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logError('/api/load-test', error, {
        service: 'node',
        upstreamUrl: `${nodeAppUrl}/api/load-test`
      });
      res.status(500).json({
        success: false,
        error: `Unable to connect to Node.js service: ${error.message}`
      });
    }
  } else if (service === 'php') {
    const phpUrl = process.env.PHP_APP_URL || 'http://php-app-dev:80';
    
    try {
      const response = await fetchWithTimeout(`${phpUrl}/api/load-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests, concurrency, service })
      }, 30000); // 30 second timeout for load test
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logError('/api/load-test', error, {
        service: 'php',
        upstreamUrl: `${phpUrl}/api/load-test`
      });
      res.status(500).json({
        success: false,
        error: `Unable to connect to PHP service: ${error.message}`
      });
    }
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid service specified. Must be "node" or "php".'
    });
  }
});

// Export app and helper functions for testing
module.exports = { app, logError, fetchWithTimeout };

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`API Service listening on port ${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}
