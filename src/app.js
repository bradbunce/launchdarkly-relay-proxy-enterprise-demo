const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const { getLaunchDarklyClient, getInitializationError, onFlagChange } = require('./launchdarkly');

const execPromise = util.promisify(exec);

// Store SSE clients
const sseClients = new Set();

// Generate a single anonymous user key for this session
const anonymousUserKey = `anon-${crypto.randomUUID()}`;

// Container name for context
const containerName = 'app-dev';

// Store last evaluated flag values for change detection
const lastFlagValues = new Map();

// Create Express app
function createApp() {
  const app = express();

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Helper function to build LaunchDarkly context
  function buildContext(customContext) {
    let userContext;
    
    // Build user context based on whether custom context is provided
    if (customContext && customContext.email && customContext.email.trim() !== '') {
      userContext = {
        key: customContext.email,
        anonymous: false
      };
      if (customContext.name && customContext.name.trim() !== '') {
        userContext.name = customContext.name;
      }
      if (customContext.location && customContext.location.trim() !== '') {
        userContext.location = customContext.location;
      }
    } else {
      userContext = {
        key: anonymousUserKey,
        anonymous: true
      };
      // Add location to anonymous users if available
      if (customContext && customContext.location && customContext.location.trim() !== '') {
        userContext.location = customContext.location;
      }
    }
    
    return {
      kind: 'multi',
      user: userContext,
      container: {
        key: containerName
      }
    };
  }

  // SSE endpoint for real-time flag updates
  app.get('/api/message/stream', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Get custom context from query params
    const customContext = {
      email: req.query.email,
      name: req.query.name,
      location: req.query.location
    };
    
    // Add client to set with context info
    const clientInfo = { res, customContext };
    sseClients.add(clientInfo);
    
    // Send initial message
    sendMessageToClient(clientInfo);
    
    // Remove client on disconnect
    req.on('close', () => {
      sseClients.delete(clientInfo);
    });
  });

  // Helper function to evaluate flag and send to a client
  async function sendMessageToClient(clientInfo) {
    const ldClient = getLaunchDarklyClient();
    
    let message = 'Unexpected Error: No message was set (this should not happen)';
    
    if (!ldClient) {
      // If SDK failed to initialize, show the error
      const error = getInitializationError();
      if (error) {
        message = `SDK Error: ${error}\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"`;
      } else {
        message = 'SDK Error: LaunchDarkly client not initialized (unknown reason)\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      }
      clientInfo.res.write(`data: ${JSON.stringify({ message })}\n\n`);
      return;
    }
    
    try {
      // Check if client is initialized
      const initError = getInitializationError();
      if (initError) {
        // SDK exists but has error - still evaluate to show fallback behavior
        const context = buildContext(clientInfo.customContext);
        const fallbackValue = await ldClient.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        message = `SDK Error: ${initError}\n\nUsing fallback variation: "${fallbackValue}"`;
      } else {
        // Build context using helper function
        const context = buildContext(clientInfo.customContext);
        
        // Evaluate the flag with descriptive fallback
        message = await ldClient.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        
        // Track flag value changes
        const contextKey = `${context.user.key}|${context.container.key}`;
        const lastValue = lastFlagValues.get(contextKey);
        if (lastValue !== undefined && lastValue !== message) {
          console.log(`=== Flag Evaluation Changed ===`);
          console.log(`Flag: user-message`);
          console.log(`Multi-Context:`);
          console.log(`  - User: ${context.user.anonymous ? 'Anonymous' : 'Custom'} (${context.user.key})`);
          if (context.user.name) console.log(`    Name: ${context.user.name}`);
          if (context.user.location) console.log(`    Location: ${context.user.location}`);
          console.log(`  - Container: ${context.container.key}`);
          console.log(`Previous value: "${lastValue}"`);
          console.log(`New value: "${message}"`);
          console.log(`Reason: Flag configuration or targeting rules changed`);
          console.log(`===============================`);
        }
        lastFlagValues.set(contextKey, message);
      }
    } catch (error) {
      console.error('Error evaluating feature flag:', error);
      message = `Flag Evaluation Error: ${error.message}\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"`;
    }
    
    clientInfo.res.write(`data: ${JSON.stringify({ message })}\n\n`);
  }

  // Broadcast message to all connected clients
  async function broadcastMessage() {
    console.log(`Broadcasting to ${sseClients.size} connected clients`);
    for (const clientInfo of sseClients) {
      await sendMessageToClient(clientInfo);
    }
  }

  // Register flag change listener
  onFlagChange((settings) => {
    console.log('Flag change callback triggered');
    broadcastMessage();
  });

  // API endpoint to get feature flag value (for initial load fallback)
  app.get('/api/message', async (req, res) => {
    const client = getLaunchDarklyClient();
    
    if (!client) {
      // If SDK failed to initialize, show the error
      const error = getInitializationError();
      const message = error 
        ? `SDK Error: ${error}\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"`
        : 'SDK Error: LaunchDarkly client not initialized (unknown reason)\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      return res.json({ message });
    }
    
    // Check if client has initialization error
    const initError = getInitializationError();
    if (initError) {
      // SDK exists but has error - still evaluate to show fallback behavior
      try {
        const context = buildContext(null);
        const fallbackValue = await client.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        return res.json({ message: `SDK Error: ${initError}\n\nUsing fallback variation: "${fallbackValue}"` });
      } catch (error) {
        return res.json({ message: `SDK Error: ${initError}\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"` });
      }
    }
    
    try {
      // Build context using helper function
      const context = buildContext(null); // Anonymous context for this endpoint
      
      const message = await client.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
      res.json({ message });
    } catch (error) {
      console.error('Error evaluating feature flag:', error);
      res.json({ message: `Flag Evaluation Error: ${error.message}\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"` });
    }
  });

  // API endpoint to get SDK configuration
  app.get('/api/sdk-config', (req, res) => {
    // Read directly from environment to avoid caching
    const useDaemonMode = process.env.USE_DAEMON_MODE === 'true';
    const relayProxyUrl = process.env.RELAY_PROXY_URL || 'http://relay-proxy:8030';
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPrefix = process.env.REDIS_PREFIX || null;
    
    res.json({
      mode: useDaemonMode ? 'Daemon Mode (Redis + Events)' : 'Relay Proxy Mode',
      useDaemonMode: useDaemonMode,
      relayProxyUrl: relayProxyUrl,
      redisHost: useDaemonMode ? redisHost : null,
      redisPort: useDaemonMode ? redisPort : null,
      redisPrefix: useDaemonMode ? redisPrefix : null
    });
  });

  // API endpoint to get relay proxy status
  app.get('/api/relay-status', async (req, res) => {
    try {
      const response = await fetch('http://relay-proxy:8030/status');
      const status = await response.json();
      
      // Check feature flag to determine if we should log the response
      const ldClient = getLaunchDarklyClient();
      if (ldClient) {
        try {
          // Build context using helper function
          const context = buildContext(null); // Anonymous context
          
          const shouldLog = await ldClient.variation('relay-proxy-status-response', context, false);
          if (shouldLog) {
            console.log('Relay Proxy Status Response:', JSON.stringify(status, null, 2));
          }
        } catch (error) {
          console.error('Error evaluating relay-proxy-status-response flag:', error);
        }
      }
      
      res.json(status);
    } catch (error) {
      console.error('Error fetching relay proxy status:', error);
      res.status(500).json({ error: 'Failed to fetch relay proxy status' });
    }
  });

  // API endpoint to get relay proxy metrics
  app.get('/api/relay-metrics', async (req, res) => {
    try {
      // Get Docker stats for relay-proxy container
      const { stdout } = await execPromise('docker stats relay-proxy --no-stream --format "{{json .}}"');
      const stats = JSON.parse(stdout);
      
      // Parse CPU and memory usage
      const cpuPercent = parseFloat(stats.CPUPerc.replace('%', ''));
      const memUsage = stats.MemUsage; // e.g., "45.5MiB / 7.775GiB"
      const memPercent = parseFloat(stats.MemPerc.replace('%', ''));
      
      res.json({
        cpu: cpuPercent,
        memory: memUsage,
        memoryPercent: memPercent,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error fetching relay proxy metrics:', error);
      res.status(500).json({ error: 'Failed to fetch relay proxy metrics' });
    }
  });

  // API endpoint for load testing with SSE
  app.get('/api/load-test/stream', async (req, res) => {
    const numClients = parseInt(req.query.clients) || 10;
    const durationSeconds = parseInt(req.query.duration) || 30;
    const evalIntervalMs = parseInt(req.query.interval) || 1000;
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendMessage = (type, message) => {
      res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
    };
    
    sendMessage('log', `=== Load Test Configuration ===`);
    sendMessage('log', `Clients: ${numClients}`);
    sendMessage('log', `Duration: ${durationSeconds} seconds`);
    sendMessage('log', `Evaluation Interval: ${evalIntervalMs}ms`);
    sendMessage('log', `==============================\n`);
    
    const stats = {
      totalEvaluations: 0,
      successfulEvaluations: 0,
      failedEvaluations: 0,
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      clientsConnected: 0,
      clientsFailed: 0
    };
    
    const clients = [];
    const intervals = [];
    
    try {
      // Initialize clients
      sendMessage('log', 'Initializing clients...\n');
      
      for (let i = 0; i < numClients; i++) {
        try {
          const client = getLaunchDarklyClient();
          if (client) {
            clients.push(client);
            stats.clientsConnected++;
            sendMessage('log', `Client ${i + 1} connected`);
          } else {
            stats.clientsFailed++;
            sendMessage('log', `Client ${i + 1} failed to connect`);
          }
        } catch (error) {
          stats.clientsFailed++;
          sendMessage('log', `Client ${i + 1} error: ${error.message}`);
        }
      }
      
      sendMessage('log', `\n${stats.clientsConnected} clients ready. Starting test...\n`);
      
      // Start evaluations for each client
      clients.forEach((client, index) => {
        const context = buildContext({
          email: `load-test-${index}@example.com`,
          name: `Load Test User ${index}`
        });
        
        const interval = setInterval(async () => {
          const startTime = Date.now();
          
          try {
            await client.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
            const latency = Date.now() - startTime;
            
            stats.totalEvaluations++;
            stats.successfulEvaluations++;
            stats.totalLatency += latency;
            stats.minLatency = Math.min(stats.minLatency, latency);
            stats.maxLatency = Math.max(stats.maxLatency, latency);
          } catch (error) {
            stats.totalEvaluations++;
            stats.failedEvaluations++;
          }
        }, evalIntervalMs);
        
        intervals.push(interval);
      });
      
      // Report stats every 5 seconds
      const statsInterval = setInterval(() => {
        const avgLatency = stats.successfulEvaluations > 0 
          ? (stats.totalLatency / stats.successfulEvaluations).toFixed(2) 
          : 0;
        const successRate = stats.totalEvaluations > 0
          ? ((stats.successfulEvaluations / stats.totalEvaluations) * 100).toFixed(2)
          : 0;
        
        sendMessage('stats', `\n--- Stats Update ---`);
        sendMessage('stats', `Evaluations: ${stats.totalEvaluations} (${stats.successfulEvaluations} success, ${stats.failedEvaluations} failed)`);
        sendMessage('stats', `Success Rate: ${successRate}%`);
        sendMessage('stats', `Latency: min=${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}, max=${stats.maxLatency}ms, avg=${avgLatency}ms`);
      }, 5000);
      
      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
      
      // Clean up
      intervals.forEach(interval => clearInterval(interval));
      clearInterval(statsInterval);
      
      // Final stats
      const avgLatency = stats.successfulEvaluations > 0 
        ? (stats.totalLatency / stats.successfulEvaluations).toFixed(2) 
        : 0;
      const successRate = stats.totalEvaluations > 0
        ? ((stats.successfulEvaluations / stats.totalEvaluations) * 100).toFixed(2)
        : 0;
      const throughput = (stats.successfulEvaluations / durationSeconds).toFixed(2);
      
      sendMessage('stats', `\n=== Final Results ===`);
      sendMessage('stats', `Clients: ${stats.clientsConnected}/${numClients} connected`);
      sendMessage('stats', `Total Evaluations: ${stats.totalEvaluations}`);
      sendMessage('stats', `Successful: ${stats.successfulEvaluations}`);
      sendMessage('stats', `Failed: ${stats.failedEvaluations}`);
      sendMessage('stats', `Success Rate: ${successRate}%`);
      sendMessage('stats', `Latency: min=${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}, max=${stats.maxLatency}ms, avg=${avgLatency}ms`);
      sendMessage('stats', `Throughput: ${throughput} evaluations/sec`);
      sendMessage('complete', '\nLoad test complete!');
      
    } catch (error) {
      sendMessage('error', error.message);
    }
    
    res.end();
  });

  // API endpoint to fetch container logs
  app.get('/api/logs/:container', async (req, res) => {
    const { container } = req.params;
    const allowedContainers = ['app-dev', 'relay-proxy', 'redis'];
    
    if (!allowedContainers.includes(container)) {
      return res.status(400).json({ error: 'Invalid container name' });
    }
    
    try {
      const { stdout, stderr } = await execPromise(`docker logs --tail 50 ${container} 2>&1`);
      const logs = (stdout + stderr).split('\n').filter(line => line.trim());
      res.json({ lines: logs });
    } catch (error) {
      console.error(`Error fetching logs for ${container}:`, error);
      res.json({ 
        error: `Unable to fetch logs for ${container}. Container may not be running.`,
        lines: []
      });
    }
  });

  // API endpoint to get Redis monitor stream
  app.get('/api/redis/monitor', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    try {
      // Start redis-cli MONITOR in the redis container
      const { spawn } = require('child_process');
      const monitor = spawn('docker', ['exec', 'redis', 'redis-cli', 'MONITOR']);
      
      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'info', message: 'Connected to Redis MONITOR' })}\n\n`);
      
      // Stream stdout
      monitor.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          res.write(`data: ${JSON.stringify({ type: 'command', message: line })}\n\n`);
        });
      });
      
      // Stream stderr
      monitor.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          res.write(`data: ${JSON.stringify({ type: 'error', message: line })}\n\n`);
        });
      });
      
      // Handle monitor process exit
      monitor.on('close', (code) => {
        res.write(`data: ${JSON.stringify({ type: 'info', message: `Monitor disconnected (code ${code})` })}\n\n`);
        res.end();
      });
      
      // Clean up on client disconnect
      req.on('close', () => {
        monitor.kill();
      });
      
    } catch (error) {
      console.error('Error starting Redis monitor:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Failed to start monitor: ${error.message}` })}\n\n`);
      res.end();
    }
  });

  // API endpoint to clear container logs
  app.post('/api/logs/:container/clear', async (req, res) => {
    const { container } = req.params;
    const allowedContainers = ['app-dev', 'relay-proxy', 'redis'];
    
    if (!allowedContainers.includes(container)) {
      return res.status(400).json({ error: 'Invalid container name' });
    }
    
    try {
      const { stdout } = await execPromise(`docker inspect --format='{{.LogPath}}' ${container}`);
      const logPath = stdout.trim();
      
      if (logPath) {
        await execPromise(`docker run --rm -v /var/lib/docker:/var/lib/docker alpine sh -c "truncate -s 0 ${logPath}"`);
        res.json({ success: true, message: `Logs cleared for ${container}` });
      } else {
        res.status(500).json({ error: 'Could not find log file path' });
      }
    } catch (error) {
      console.error(`Error clearing logs for ${container}:`, error);
      res.status(500).json({ 
        error: `Unable to clear logs for ${container}. ${error.message}`
      });
    }
  });

  return app;
}

module.exports = { createApp };
