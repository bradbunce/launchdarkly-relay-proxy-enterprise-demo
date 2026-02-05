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

// Helper function to get container IP address
async function getContainerIP(containerName) {
  try {
    const { stdout } = await execPromise(
      `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`
    );
    const ip = stdout.trim();
    
    if (!ip) {
      throw new Error(`Container ${containerName} has no IP address. Container may not be running or not connected to a network.`);
    }
    
    return ip;
  } catch (error) {
    // Check if error is due to container not existing
    if (error.message.includes('no such object') || 
        error.message.includes('No such object') || 
        error.message.includes('No such container')) {
      throw new Error(`Container ${containerName} does not exist`);
    }
    
    // Re-throw with more context
    throw new Error(`Failed to get IP for container ${containerName}: ${error.message}`);
  }
}

// Helper function to check if container is running
async function checkContainerRunning(containerName) {
  try {
    const { stdout } = await execPromise(
      `docker inspect -f '{{.State.Running}}' ${containerName}`
    );
    return stdout.trim() === 'true';
  } catch (error) {
    // If container doesn't exist or any other error occurs, return false
    return false;
  }
}

// Helper function to resolve LaunchDarkly domains to IP addresses
async function resolveLaunchDarklyDomains() {
  const domains = [
    'clientstream.launchdarkly.com',
    'app.launchdarkly.com',
    'events.launchdarkly.com'
  ];
  
  const ips = new Set();
  
  for (const domain of domains) {
    try {
      const { stdout } = await execPromise(`dig +short ${domain}`);
      const resolvedIPs = stdout.trim().split('\n').filter(ip => {
        // Filter out empty lines and CNAME records (which contain dots but are domain names)
        // Valid IPv4 addresses have 4 octets separated by dots
        if (!ip || ip.trim() === '') return false;
        
        // Check if it's a valid IPv4 address (simple check: starts with a digit)
        // This filters out CNAME records which typically start with letters
        const trimmedIP = ip.trim();
        return /^\d+\.\d+\.\d+\.\d+$/.test(trimmedIP);
      });
      
      resolvedIPs.forEach(ip => ips.add(ip.trim()));
    } catch (error) {
      // Log warning but continue with other domains
      console.warn(`Failed to resolve ${domain}:`, error.message);
    }
  }
  
  return Array.from(ips);
}

// Helper function to add iptables blocking rules
async function addBlockingRules(containerIP, targetIPs) {
  let rulesAdded = 0;
  
  for (const targetIP of targetIPs) {
    try {
      // Check if rule already exists
      // iptables -C returns exit code 0 if rule exists, non-zero if it doesn't
      try {
        await execPromise(
          `iptables -C FORWARD -s ${containerIP} -d ${targetIP} -j DROP`
        );
        // Rule already exists, skip adding
        console.log(`Rule already exists for ${containerIP} -> ${targetIP}`);
      } catch (checkError) {
        // Rule doesn't exist, add it
        await execPromise(
          `iptables -I FORWARD -s ${containerIP} -d ${targetIP} -j DROP`
        );
        rulesAdded++;
        console.log(`Added blocking rule for ${containerIP} -> ${targetIP}`);
      }
    } catch (error) {
      console.error(`Failed to add rule for ${targetIP}:`, error.message);
    }
  }
  
  return rulesAdded;
}

// Helper function to remove iptables blocking rules
async function removeBlockingRules(containerIP) {
  let rulesRemoved = 0;
  
  try {
    // List all rules matching our pattern
    const { stdout } = await execPromise(
      `iptables -S FORWARD | grep "\\-s ${containerIP}.*\\-j DROP"`
    );
    
    const rules = stdout.trim().split('\n').filter(r => r.trim());
    
    for (const rule of rules) {
      // Convert -A to -D for deletion
      const deleteRule = rule.replace('-A FORWARD', '-D FORWARD');
      
      try {
        await execPromise(`iptables ${deleteRule}`);
        rulesRemoved++;
        console.log(`Removed blocking rule: ${rule}`);
      } catch (error) {
        console.error(`Failed to remove rule: ${rule}`, error.message);
      }
    }
  } catch (error) {
    // No rules found or error listing rules
    console.log('No blocking rules found or error listing rules:', error.message);
  }
  
  return rulesRemoved;
}

// Helper function to check if disconnection is active
async function checkDisconnectionStatus() {
  try {
    const containerIP = await getContainerIP('relay-proxy');
    const { stdout } = await execPromise(
      `iptables -S FORWARD | grep "\\-s ${containerIP}.*\\-j DROP" | wc -l`
    );
    return parseInt(stdout.trim()) > 0;
  } catch (error) {
    return false;
  }
}

// Helper function to count active blocking rules
async function countBlockingRules(containerIP) {
  try {
    const { stdout } = await execPromise(
      `iptables -S FORWARD | grep "\\-s ${containerIP}.*\\-j DROP" | wc -l`
    );
    return parseInt(stdout.trim());
  } catch (error) {
    return 0;
  }
}

// Helper function to get list of blocked IPs
async function getBlockedIPs(containerIP) {
  try {
    const { stdout } = await execPromise(
      `iptables -S FORWARD | grep "\\-s ${containerIP}.*\\-j DROP"`
    );
    
    const rules = stdout.trim().split('\n').filter(r => r.trim());
    const ips = rules.map(rule => {
      const match = rule.match(/-d ([0-9.]+)/);
      return match ? match[1] : null;
    }).filter(ip => ip);
    
    return ips;
  } catch (error) {
    return [];
  }
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
let relayProxyCacheClients = []; // SSE clients listening for cache updates

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
      
      // Broadcast initial data to all connected SSE clients
      broadcastCacheUpdate();
      
      if (cb) cb();
      return Promise.resolve();
    }

    get(kind, key, cb) {
      const kindStr = typeof kind === 'object' ? kind.namespace : kind;
      const collection = kindStr === 'features' ? this.data.flags : this.data.segments;
      const result = collection[key] || null;
      if (cb) cb(result);
      return Promise.resolve(result);
    }

    all(kind, cb) {
      const kindStr = typeof kind === 'object' ? kind.namespace : kind;
      const collection = kindStr === 'features' ? this.data.flags : this.data.segments;
      if (cb) cb(collection);
      return Promise.resolve(collection);
    }

    upsert(kind, item, cb) {
      const kindStr = typeof kind === 'object' ? kind.namespace : kind;
      console.log(`[Relay Proxy Cache] Update received: ${kindStr}/${item.key} (kind type: ${typeof kind}, kind:`, JSON.stringify(kind), ')');
      const collection = kindStr === 'features' ? this.data.flags : this.data.segments;
      collection[item.key] = item;
      relayProxyCacheData = { ...this.data };
      
      // Broadcast update to all connected SSE clients
      broadcastCacheUpdate();
      
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

// Broadcast cache updates to all connected SSE clients
function broadcastCacheUpdate() {
  if (!relayProxyCacheData || relayProxyCacheClients.length === 0) {
    return;
  }
  
  const data = JSON.stringify({
    flags: relayProxyCacheData.flags,
    timestamp: Date.now()
  });
  
  console.log(`[Relay Proxy Cache] Broadcasting update to ${relayProxyCacheClients.length} clients`);
  
  // Send to all connected clients
  relayProxyCacheClients = relayProxyCacheClients.filter(client => {
    try {
      client.write(`data: ${data}\n\n`);
      return true;
    } catch (error) {
      console.log('[Relay Proxy Cache] Client disconnected');
      return false;
    }
  });
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

// Relay Proxy cache SSE stream endpoint
app.get('/api/relay-proxy/cache/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Initialize the client if not already done
    if (!relayProxyCacheClient) {
      await initRelayProxyCacheClient();
    }
    
    // Add this client to the broadcast list
    relayProxyCacheClients.push(res);
    console.log(`[Relay Proxy Cache] SSE client connected (${relayProxyCacheClients.length} total)`);
    
    // Send initial data immediately
    if (relayProxyCacheData && relayProxyCacheData.flags) {
      const data = JSON.stringify({
        flags: relayProxyCacheData.flags,
        timestamp: Date.now()
      });
      console.log(`[Relay Proxy Cache] Sending initial data to new client: ${Object.keys(relayProxyCacheData.flags).length} flags`);
      res.write(`data: ${data}\n\n`);
    } else {
      console.log('[Relay Proxy Cache] No initial data available yet');
    }
    
    // Handle client disconnect
    req.on('close', () => {
      relayProxyCacheClients = relayProxyCacheClients.filter(client => client !== res);
      console.log(`[Relay Proxy Cache] SSE client disconnected (${relayProxyCacheClients.length} remaining)`);
    });
    
  } catch (error) {
    logError('/api/relay-proxy/cache/stream', error, {
      message: 'Failed to initialize Relay Proxy cache stream'
    });
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
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

// Python Service container status endpoint (Docker level)
app.get('/api/python/container-status', async (req, res) => {
  try {
    // Check if container is running
    const { stdout: inspectOutput } = await execPromise('docker inspect -f "{{.State.Running}}" python-app-dev 2>&1');
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
    logError('/api/python/container-status', error, {
      command: 'docker inspect python-app-dev'
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

// Python Service start endpoint
app.post('/api/python/start', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker start python-app-dev');
    res.json({
      success: true,
      message: 'Python Service container started successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/python/start', error, {
      command: 'docker start python-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Python Service stop endpoint
app.post('/api/python/stop', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker stop python-app-dev');
    res.json({
      success: true,
      message: 'Python Service container stopped successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/python/stop', error, {
      command: 'docker stop python-app-dev'
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Python Service restart endpoint
app.post('/api/python/restart', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker restart python-app-dev');
    res.json({
      success: true,
      message: 'Python Service container restarted successfully',
      container: stdout.trim()
    });
  } catch (error) {
    logError('/api/python/restart', error, {
      command: 'docker restart python-app-dev'
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

// Python application status endpoint
app.get('/api/python/status', async (req, res) => {
  const pythonAppUrl = process.env.PYTHON_APP_URL || 'http://python-app-dev:5000';
  
  try {
    const response = await fetchWithTimeout(
      `${pythonAppUrl}/api/status`,
      {},
      5000
    );
    
    const data = await response.json();
    
    // Preserve original status code from Python app
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/python/status', error, {
      upstreamUrl: `${pythonAppUrl}/api/status`
    });
    res.status(500).json({
      connected: false,
      error: 'Unable to connect to Python application'
    });
  }
});

// Python context endpoint (proxy to Python app)
// GET: Fetch current context
app.get('/api/python/context', async (req, res) => {
  const pythonAppUrl = process.env.PYTHON_APP_URL || 'http://python-app-dev:5000';
  
  try {
    const response = await fetchWithTimeout(
      `${pythonAppUrl}/api/context`,
      {},
      5000
    );
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/python/context (GET)', error, {
      upstreamUrl: `${pythonAppUrl}/api/context`
    });
    res.status(500).json({
      kind: 'user',
      key: 'error',
      anonymous: true,
      error: 'Unable to connect to Python application'
    });
  }
});

// POST: Update context
app.post('/api/python/context', express.json(), async (req, res) => {
  const pythonAppUrl = process.env.PYTHON_APP_URL || 'http://python-app-dev:5000';
  
  try {
    const response = await fetchWithTimeout(
      `${pythonAppUrl}/api/context`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      },
      5000
    );
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/python/context', error, {
      upstreamUrl: `${pythonAppUrl}/api/context`
    });
    res.status(500).json({
      success: false,
      error: 'Unable to connect to Python application'
    });
  }
});

// Python SDK data store endpoint (proxy to Python app)
app.post('/api/python/sdk-data-store', express.json(), async (req, res) => {
  const pythonAppUrl = process.env.PYTHON_APP_URL || 'http://python-app-dev:5000';
  
  try {
    const response = await fetchWithTimeout(
      `${pythonAppUrl}/api/sdk-data-store`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      },
      5000
    );
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logError('/api/python/sdk-data-store', error, {
      upstreamUrl: `${pythonAppUrl}/api/sdk-data-store`
    });
    res.status(500).json({
      success: false,
      error: 'Unable to connect to Python application',
      flags: {}
    });
  }
});

// Python SSE stream proxy endpoint
app.get('/api/python/message/stream', async (req, res) => {
  const pythonUrl = process.env.PYTHON_APP_URL || 'http://python-app-dev:5000';
  
  // Get context key from query parameter and forward it
  const contextKey = req.query.contextKey;
  const pythonStreamUrl = contextKey 
    ? `${pythonUrl}/api/message/stream?contextKey=${encodeURIComponent(contextKey)}`
    : `${pythonUrl}/api/message/stream`;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  try {
    // Connect to Python SSE stream with custom User-Agent
    const response = await fetch(pythonStreamUrl, {
      headers: {
        'User-Agent': 'api-service/1.0'
      }
    });
    
    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ error: 'Python service unavailable' })}\n\n`);
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
        logError('/api/python/message/stream', error, {
          pythonUrl: `${pythonUrl}/api/message/stream`
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
    logError('/api/python/message/stream', error, {
      pythonUrl: `${pythonUrl}/api/message/stream`
    });
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Feature flag evaluation endpoint for dashboard panel selection
// Initialize LaunchDarkly SDK client for flag evaluation
let dashboardFlagClient = null;

async function initDashboardFlagClient() {
  if (dashboardFlagClient) {
    return dashboardFlagClient;
  }

  const LD = require('@launchdarkly/node-server-sdk');
  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  
  if (!sdkKey) {
    throw new Error('LAUNCHDARKLY_SDK_KEY not configured');
  }

  // Initialize SDK with default configuration (direct connection to LaunchDarkly)
  dashboardFlagClient = LD.init(sdkKey, {
    stream: true,
    sendEvents: false,
    diagnosticOptOut: true
  });

  await dashboardFlagClient.waitForInitialization({ timeout: 10 });
  console.log('[Dashboard Flag Client] SDK initialized successfully');
  
  return dashboardFlagClient;
}

app.get('/api/flag/dashboard-service-panel-1', async (req, res) => {
  try {
    // Initialize the SDK client if not already done
    if (!dashboardFlagClient) {
      await initDashboardFlagClient();
    }
    
    // Check if SDK is initialized
    if (!dashboardFlagClient.initialized()) {
      return res.status(503).json({
        error: 'SDK not initialized',
        value: 'node.js'  // Default fallback
      });
    }
    
    // Create anonymous context for flag evaluation
    const context = {
      kind: 'user',
      key: 'dashboard-user',
      anonymous: true
    };
    
    // Evaluate the flag
    const value = await dashboardFlagClient.variation(
      'dashboard-service-panel-1',
      context,
      'node.js'  // Default value
    );
    
    res.json({ value });
  } catch (error) {
    logError('/api/flag/dashboard-service-panel-1', error, {
      message: 'Flag evaluation failed'
    });
    res.status(500).json({
      error: 'Flag evaluation failed',
      value: 'node.js'  // Default fallback
    });
  }
});

// Container logs endpoint
app.get('/api/logs/:container', async (req, res) => {
  const { container } = req.params;
  const allowedContainers = ['node-app-dev', 'php-app-dev', 'python-app-dev', 'relay-proxy', 'redis'];
  
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
  const allowedContainers = ['node-app-dev', 'php-app-dev', 'python-app-dev', 'relay-proxy', 'redis'];
  
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

// Helper function to ensure DOCKER-USER chain exists
async function ensureDockerUserChain() {
  try {
    // Check if DOCKER-USER chain exists
    await execPromise('iptables -L DOCKER-USER -n 2>&1');
  } catch (error) {
    // Chain doesn't exist, create it
    try {
      await execPromise('iptables -N DOCKER-USER');
      // Add a rule to jump back to RETURN (allow by default)
      await execPromise('iptables -A DOCKER-USER -j RETURN');
      console.log('Created DOCKER-USER chain');
    } catch (createError) {
      console.error('Failed to create DOCKER-USER chain:', createError.message);
      throw createError;
    }
  }
}

// Helper function to get Docker network subnet
async function getDockerNetworkSubnet(networkName) {
  try {
    // Try with the full compose project name prefix first
    let fullNetworkName = `launchdarkly-relay-proxy-enterprise-demo_${networkName}`;
    let { stdout } = await execPromise(
      `docker network inspect ${fullNetworkName} --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo ""`
    );
    
    if (!stdout.trim()) {
      // Try without prefix
      ({ stdout } = await execPromise(
        `docker network inspect ${networkName} --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo ""`
      ));
    }
    
    return stdout.trim() || null;
  } catch (error) {
    console.error(`Failed to get subnet for network ${networkName}:`, error.message);
    return null;
  }
}

// Relay Proxy disconnect endpoint
app.post('/api/relay-proxy/disconnect', async (req, res) => {
  try {
    // 1. Check if container is running
    const isRunning = await checkContainerRunning('relay-proxy');
    if (!isRunning) {
      return res.status(500).json({
        success: false,
        error: 'Container relay-proxy is not running'
      });
    }
    
    // 2. Ensure DOCKER-USER chain exists
    await ensureDockerUserChain();
    
    // 3. Get container IP address
    const containerIP = await getContainerIP('relay-proxy');
    
    // 4. Get Docker network subnet to allow internal traffic
    const subnet = await getDockerNetworkSubnet('launchdarkly-network');
    if (!subnet) {
      return res.status(500).json({
        success: false,
        error: 'Failed to determine Docker network subnet'
      });
    }
    
    // 5. Check if already disconnected by checking for existing rule on the Docker host
    try {
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -C DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP 2>&1`
      );
      // If command succeeds, rule exists - but we should still restart to ensure disconnection
      console.log('Rule already exists, will restart relay-proxy to ensure disconnection');
    } catch (error) {
      // Rule doesn't exist, will add it
    }
    
    // 6. Kill existing TCP connections to LaunchDarkly FIRST before blocking
    // This ensures the relay proxy doesn't continue receiving updates on existing connections
    console.log('Killing existing TCP connections to LaunchDarkly...');
    try {
      // Add REJECT rules for BOTH outbound and inbound traffic to kill existing connections
      // Outbound: packets FROM the relay proxy TO external hosts
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -I DOCKER-USER -s ${containerIP} ! -d ${subnet} -j REJECT --reject-with tcp-reset`
      );
      // Inbound: packets TO the relay proxy FROM external hosts  
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -I DOCKER-USER -d ${containerIP} ! -s ${subnet} -j REJECT --reject-with tcp-reset`
      );
      console.log('Added REJECT rules for both directions to send RST packets');
      
      // Wait for RST packets to be sent
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Remove both REJECT rules
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -D DOCKER-USER -s ${containerIP} ! -d ${subnet} -j REJECT --reject-with tcp-reset`
      );
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -D DOCKER-USER -d ${containerIP} ! -s ${subnet} -j REJECT --reject-with tcp-reset`
      );
      console.log('Removed REJECT rules');
    } catch (rstError) {
      console.log('Note: Could not send RST packets:', rstError.message);
    }
    
    // 7. Add iptables rule to block external traffic
    // We need to use docker exec to run iptables on the Docker host (VM on macOS)
    // This is the only way to actually block traffic on Docker Desktop
    try {
      // First, try to remove any existing DROP rule
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -D DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP 2>/dev/null || true`
      );
      
      // Add the blocking rule on the Docker host
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -I DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP`
      );
      
      console.log(`Added DOCKER-USER rule on host: block ${containerIP} to internet, allow ${subnet}`);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to add iptables rule: ${error.message}`
      });
    }
    
    // 8. Don't restart the container - let it keep serving cached data
    // The iptables rule will block new connections to LaunchDarkly
    console.log('Relay-proxy disconnected - cache remains available for downstream clients');
    
    return res.status(200).json({
      success: true,
      message: 'Relay Proxy disconnected from LaunchDarkly',
      containerIP,
      subnet,
      rule: `Block ${containerIP} to internet, allow ${subnet}`
    });
    
  } catch (error) {
    logError('/api/relay-proxy/disconnect', error, {
      operation: 'disconnect'
    });
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect relay proxy'
    });
  }
});

// Relay Proxy reconnect endpoint
app.post('/api/relay-proxy/reconnect', async (req, res) => {
  try {
    // 1. Get container IP address
    const containerIP = await getContainerIP('relay-proxy');
    
    // 2. Get Docker network subnet
    const subnet = await getDockerNetworkSubnet('launchdarkly-network');
    if (!subnet) {
      return res.status(500).json({
        success: false,
        error: 'Failed to determine Docker network subnet'
      });
    }
    
    // 3. Check if already connected by checking for rule on the Docker host
    try {
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -C DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP 2>&1`
      );
      // Rule exists, need to remove it
    } catch (error) {
      // Rule doesn't exist, already connected
      return res.status(200).json({
        success: true,
        message: 'Relay Proxy already connected',
        containerIP,
        subnet
      });
    }
    
    // 4. Remove the iptables rule from DOCKER-USER chain on the Docker host
    try {
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -D DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP`
      );
      console.log(`Removed DOCKER-USER rule from host for ${containerIP}`);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to remove iptables rule: ${error.message}`
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Relay Proxy reconnected to LaunchDarkly',
      containerIP,
      subnet
    });
    
  } catch (error) {
    logError('/api/relay-proxy/reconnect', error, {
      operation: 'reconnect'
    });
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to reconnect relay proxy'
    });
  }
});

// Relay Proxy connection status endpoint
app.get('/api/relay-proxy/connection-status', async (req, res) => {
  try {
    // 1. Check if container is running
    const isRunning = await checkContainerRunning('relay-proxy');
    if (!isRunning) {
      return res.status(200).json({
        connected: false,
        containerRunning: false
      });
    }
    
    // 2. Get container IP and network subnet
    const containerIP = await getContainerIP('relay-proxy');
    const subnet = await getDockerNetworkSubnet('launchdarkly-network');
    
    if (!subnet) {
      return res.status(200).json({
        connected: true, // Assume connected if we can't check
        containerRunning: true,
        error: 'Could not determine network subnet'
      });
    }
    
    // 3. Check if blocking rule exists in DOCKER-USER chain on the Docker host
    try {
      await execPromise(
        `docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -C DOCKER-USER -s ${containerIP} ! -d ${subnet} -j DROP 2>&1`
      );
      // Rule exists, so it's disconnected
      return res.status(200).json({
        connected: false,
        containerRunning: true,
        containerIP,
        subnet
      });
    } catch (error) {
      // Rule doesn't exist, so it's connected
      return res.status(200).json({
        connected: true,
        containerRunning: true,
        containerIP,
        subnet
      });
    }
    
  } catch (error) {
    logError('/api/relay-proxy/connection-status', error, {
      operation: 'connection-status'
    });
    
    return res.status(500).json({
      connected: false,
      containerRunning: false,
      error: error.message
    });
  }
});

// Export app and helper functions for testing
module.exports = { app, logError, fetchWithTimeout, getContainerIP, checkContainerRunning, resolveLaunchDarklyDomains, addBlockingRules, removeBlockingRules, checkDisconnectionStatus, countBlockingRules, getBlockedIPs };

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
