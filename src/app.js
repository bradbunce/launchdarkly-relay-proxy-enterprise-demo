const express = require('express');
const session = require('express-session');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const { getLaunchDarklyClient, getInitializationError, getInspectableStore, onFlagChange } = require('./launchdarkly');

const execPromise = util.promisify(exec);

// Import HashValueExposer for bucketing hash calculations
const { HashValueExposer } = require('./nodejs/src/HashValueExposer.js');
const hashExposer = new HashValueExposer();

// Import undici Agent for custom fetch timeouts
let sseAgent = null;
try {
  const undici = require('undici');
  sseAgent = new undici.Agent({
    headersTimeout: 60000, // 60 seconds for headers
    bodyTimeout: 0, // No timeout for body (SSE streams are long-lived)
    keepAliveTimeout: 600000, // 10 minutes keep-alive
    keepAliveMaxTimeout: 600000
  });
} catch (err) {
  console.log('undici not available, using default fetch settings');
}

// Store SSE clients
const sseClients = new Set();

// Store SSE clients for Node.js service (dashboard)
const nodeSseClients = new Set();

// In-memory context store to share context between POST endpoint and SSE connections
// Key: context key (e.g., "node-anon-xxx" or "user@example.com")
// Value: context object with { type, key, email, name, location, anonymous }
const nodeContextStore = new Map();

// Generate a single anonymous user key for this session
const anonymousUserKey = `anon-${crypto.randomUUID()}`;

// Container name for context
const containerName = 'node-app-dev';

// Store last evaluated flag values for change detection
const lastFlagValues = new Map();

// Create Express app
function createApp() {
  const app = express();

  // Enable CORS for all routes to allow dashboard at port 8000
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Allow requests from dashboard (port 8000) and localhost variations
    if (origin && (origin.includes('localhost:8000') || origin.includes('127.0.0.1:8000'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Fallback for other origins (without credentials)
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    next();
  });

  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'launchdarkly-demo-secret-' + crypto.randomUUID(),
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false, // Set to true if using HTTPS
      httpOnly: false, // Allow JavaScript access for cross-origin
      sameSite: false, // Disable sameSite to allow all cross-origin requests (development only)
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Middleware to initialize session context
  app.use((req, res, next) => {
    if (!req.session.nodeServiceContext) {
      req.session.nodeServiceContext = {
        type: 'anonymous',
        key: `node-anon-${crypto.randomUUID()}`,
        anonymous: true
      };
      
      // Also add to in-memory store so SSE connections can access it
      nodeContextStore.set(req.session.nodeServiceContext.key, { ...req.session.nodeServiceContext });
      console.log(`[Session Init] Created new anonymous context: ${req.session.nodeServiceContext.key}`);
    }
    next();
  });



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
        kind: 'container',
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
        message = 'SDK Error: ' + error + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      } else {
        message = 'SDK Error: LaunchDarkly client not initialized (unknown reason)\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      }
      clientInfo.res.write(`data: ${JSON.stringify({ message })}\n\n`);
      return;
    }
    
    try {
      // Wait for SDK to be initialized before evaluating (max 3 seconds)
      if (!ldClient.initialized()) {
        console.log(`[message-stream] SDK not yet initialized, waiting up to 3 seconds...`);
        try {
          await ldClient.waitForInitialization({ timeout: 3 });
          console.log(`[message-stream] SDK initialized successfully`);
        } catch (timeoutError) {
          console.warn(`[message-stream] SDK initialization timeout, proceeding anyway`);
        }
      }
      
      // Check if client is initialized
      const initError = getInitializationError();
      if (initError) {
        // SDK exists but has error - still evaluate to show fallback behavior
        const context = buildContext(clientInfo.customContext);
        const fallbackValue = await ldClient.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        message = 'SDK Error: ' + initError + '\n\nUsing fallback variation: "' + fallbackValue + '"';
      } else {
        // Build context using helper function
        const context = buildContext(clientInfo.customContext);
        
        // Wait for SDK to have valid flag data (max 5 seconds)
        const maxWaitTime = 5000; // 5 seconds
        const waitInterval = 100; // 100ms
        let waited = 0;
        let flagsValid = false;
        
        console.log(`[message-stream] Waiting for SDK to have valid flag data...`);
        while (waited < maxWaitTime) {
          // Check if SDK has valid flag data using allFlagsState
          const flagsState = await ldClient.allFlagsState(context);
          flagsValid = flagsState.valid;
          
          if (flagsValid) {
            console.log(`[message-stream] SDK has valid flag data after ${waited}ms`);
            break;
          }
          
          // Wait a bit and try again
          await new Promise(resolve => setTimeout(resolve, waitInterval));
          waited += waitInterval;
        }
        
        if (!flagsValid) {
          console.log(`[message-stream] SDK still doesn't have valid flag data after ${maxWaitTime}ms wait`);
        }
        
        // Now evaluate the flag
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
      message = 'Flag Evaluation Error: ' + error.message + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
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
    broadcastNodeServiceMessage();
  });

  // API endpoint to get feature flag value (for initial load fallback)
  app.get('/api/message', async (req, res) => {
    const client = getLaunchDarklyClient();
    
    if (!client) {
      // If SDK failed to initialize, show the error
      const error = getInitializationError();
      const message = error 
        ? 'SDK Error: ' + error + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"'
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
      res.json({ message: 'Flag Evaluation Error: ' + error.message + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"' });
    }
  });

  // API endpoint to get SDK configuration
  app.get('/api/sdk-config', (req, res) => {
    // Node.js always uses Proxy mode
    const relayProxyUrl = process.env.RELAY_PROXY_URL || 'http://relay-proxy:8030';
    
    res.json({
      mode: 'Proxy Mode',
      relayProxyUrl: relayProxyUrl
    });
  });
  
  // Add flag change listener for broadcasting updates
  onFlagChange((settings) => {
    console.log('Flag change callback triggered');
    broadcastMessage();
    broadcastNodeServiceMessage();
  });



  // API endpoint to trigger load test (POST)
  app.post('/api/load-test', express.json(), async (req, res) => {
    const requests = parseInt(req.body.requests) || 100;
    const concurrency = parseInt(req.body.concurrency) || 10;
    const service = req.body.service || 'node';
    
    // Only handle Node.js service here
    if (service !== 'node') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint only handles Node.js load tests'
      });
    }
    
    try {
      // Run load test and wait for results
      const results = await runLoadTest(requests, concurrency);
      
      // Return results
      res.status(200).json({
        success: true,
        totalRequests: results.totalRequests,
        successful: results.successful,
        failed: results.failed,
        avgResponseTime: results.avgResponseTime,
        requestsPerSecond: results.requestsPerSecond
      });
    } catch (error) {
      console.error('Load test error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Helper function to run load test
  async function runLoadTest(totalRequests, concurrency) {
    console.log('=== Load Test Configuration ===');
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Concurrency: ${concurrency}`);
    console.log('==============================\n');
    
    const stats = {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0
    };
    
    const client = getLaunchDarklyClient();
    if (!client) {
      console.log('Failed to get LaunchDarkly client');
      throw new Error('LaunchDarkly client not available');
    }
    
    console.log('Starting load test...\n');
    const startTime = Date.now();
    
    // Run requests in batches based on concurrency
    const batches = Math.ceil(totalRequests / concurrency);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrency, totalRequests - (batch * concurrency));
      const promises = [];
      
      for (let i = 0; i < batchSize; i++) {
        const requestNum = (batch * concurrency) + i;
        const context = buildContext({
          email: `load-test-${requestNum}@example.com`,
          name: `Load Test User ${requestNum}`
        });
        
        const promise = (async () => {
          const reqStartTime = Date.now();
          try {
            const flagValue = await client.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
            const latency = Date.now() - reqStartTime;
            
            // Track custom event with response time metric
            client.track('load-test-request', context, {
              requestNumber: requestNum,
              batchNumber: batch,
              flagValue: flagValue
            }, latency);
            
            stats.totalRequests++;
            stats.successful++;
            stats.totalLatency += latency;
            stats.minLatency = Math.min(stats.minLatency, latency);
            stats.maxLatency = Math.max(stats.maxLatency, latency);
          } catch (error) {
            stats.totalRequests++;
            stats.failed++;
          }
        })();
        
        promises.push(promise);
      }
      
      await Promise.all(promises);
      
      // Log progress every 10 batches
      if ((batch + 1) % 10 === 0) {
        console.log(`Progress: ${stats.totalRequests}/${totalRequests} requests completed`);
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000; // in seconds
    
    // Flush events to ensure they're sent to LaunchDarkly
    console.log('\nFlushing events to LaunchDarkly...');
    await client.flush();
    console.log('Events flushed successfully');
    
    // Final stats
    const avgLatency = stats.successful > 0 
      ? (stats.totalLatency / stats.successful).toFixed(2) 
      : 0;
    const requestsPerSecond = (stats.successful / totalTime).toFixed(2);
    
    console.log('\n=== Final Results ===');
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Successful: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Average Response Time: ${avgLatency}ms`);
    console.log(`Min Latency: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`);
    console.log(`Max Latency: ${stats.maxLatency}ms`);
    console.log(`Total Time: ${totalTime.toFixed(2)}s`);
    console.log(`Requests/sec: ${requestsPerSecond}`);
    console.log('\nLoad test complete!');
    
    return {
      totalRequests: stats.totalRequests,
      successful: stats.successful,
      failed: stats.failed,
      avgResponseTime: parseFloat(avgLatency),
      requestsPerSecond: parseFloat(requestsPerSecond)
    };
  }

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
      
      // Helper function to check if a line contains the PING command
      const containsPingCommand = (line) => {
        // Match "ping" as a complete word/command using word boundaries or quotes
        return /\bping\b|"ping"/i.test(line);
      };
      
      // Stream stdout
      monitor.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          // Filter out PING commands but preserve words containing "ping" like "shopping"
          if (!containsPingCommand(line)) {
            res.write(`data: ${JSON.stringify({ type: 'command', message: line })}\n\n`);
          }
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



  // ===== Node.js Service Endpoints (Dashboard) =====
  
  // Helper function to build Node.js service context from session
  function buildNodeServiceContext(req) {
    // Try to get context from in-memory store first (using context key from query param)
    const contextKey = req.query?.contextKey || req.session.nodeServiceContext?.key;
    let nodeServiceContext = null;
    
    if (contextKey && nodeContextStore.has(contextKey)) {
      nodeServiceContext = nodeContextStore.get(contextKey);
      console.log('[buildNodeServiceContext] Using context from in-memory store:', contextKey);
    } else {
      // Fall back to session if not in store
      nodeServiceContext = req.session.nodeServiceContext;
      console.log('[buildNodeServiceContext] Using context from session');
    }
    
    console.log('[buildNodeServiceContext] Context data:', JSON.stringify(nodeServiceContext, null, 2));
    
    const userContext = {
      key: nodeServiceContext.key,
      anonymous: nodeServiceContext.anonymous || false
    };
    
    if (nodeServiceContext.name) {
      userContext.name = nodeServiceContext.name;
      console.log('[buildNodeServiceContext] Added name:', nodeServiceContext.name);
    }
    if (nodeServiceContext.email) {
      userContext.email = nodeServiceContext.email;
      console.log('[buildNodeServiceContext] Added email:', nodeServiceContext.email);
    }
    if (nodeServiceContext.location) {
      userContext.location = nodeServiceContext.location;
      console.log('[buildNodeServiceContext] Added location:', nodeServiceContext.location);
    } else {
      console.log('[buildNodeServiceContext] NO LOCATION in context!');
    }
    
    const context = {
      kind: 'multi',
      user: userContext,
      container: {
        kind: 'container',
        key: 'node-service'
      }
    };
    
    console.log('[buildNodeServiceContext] Final context:', JSON.stringify(context, null, 2));
    
    return context;
  }

  // SSE endpoint for Node.js service real-time flag updates
  app.get('/api/node/message/stream', (req, res) => {
    // Get context key from query parameter
    const contextKey = req.query.contextKey;
    
    // Debug logging
    console.log('=== SSE Connection ===');
    console.log('Context Key from URL:', contextKey);
    console.log('Session ID:', req.sessionID);
    console.log('Session Context Key:', req.session.nodeServiceContext?.key);
    console.log('In-memory store has context:', nodeContextStore.has(contextKey));
    if (nodeContextStore.has(contextKey)) {
      console.log('In-memory context:', JSON.stringify(nodeContextStore.get(contextKey), null, 2));
    }
    console.log('======================');
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Add client to set - context will be read from in-memory store using contextKey
    const clientInfo = { res, req, serviceId: 'node' };
    nodeSseClients.add(clientInfo);
    
    // Send initial message
    sendNodeServiceMessage(clientInfo);
    
    // Remove client on disconnect
    req.on('close', () => {
      nodeSseClients.delete(clientInfo);
    });
  });

  // Helper function to evaluate flag and send to Node.js service client
  async function sendNodeServiceMessage(clientInfo) {
    const ldClient = getLaunchDarklyClient();
    
    let message = 'Unexpected Error: No message was set (this should not happen)';
    let hashInfo = null;
    
    if (!ldClient) {
      const error = getInitializationError();
      if (error) {
        message = 'SDK Error: ' + error + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      } else {
        message = 'SDK Error: LaunchDarkly client not initialized (unknown reason)\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
      }
      clientInfo.res.write(`data: ${JSON.stringify({ message, hashInfo })}\n\n`);
      return;
    }
    
    try {
      // Wait for SDK to be initialized before evaluating (max 3 seconds)
      if (!ldClient.initialized()) {
        console.log(`[node-service] SDK not yet initialized, waiting up to 3 seconds...`);
        try {
          await ldClient.waitForInitialization({ timeout: 3 });
          console.log(`[node-service] SDK initialized successfully`);
        } catch (timeoutError) {
          console.warn(`[node-service] SDK initialization timeout, proceeding anyway`);
        }
      }
      
      const initError = getInitializationError();
      if (initError) {
        const context = buildNodeServiceContext(clientInfo.req);
        const fallbackValue = await ldClient.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        message = 'SDK Error: ' + initError + '\n\nUsing fallback variation: "' + fallbackValue + '"';
        clientInfo.res.write(`data: ${JSON.stringify({ message, hashInfo: null })}\n\n`);
        return;
      } else {
        const context = buildNodeServiceContext(clientInfo.req);
        
        // Wait for SDK to have valid flag data (max 5 seconds)
        const maxWaitTime = 5000; // 5 seconds
        const waitInterval = 100; // 100ms
        let waited = 0;
        let flagsValid = false;
        
        console.log(`[node-service] Waiting for SDK to have valid flag data...`);
        while (waited < maxWaitTime) {
          // Check if SDK has valid flag data using allFlagsState
          const flagsState = await ldClient.allFlagsState(context);
          flagsValid = flagsState.valid;
          
          if (flagsValid) {
            console.log(`[node-service] SDK has valid flag data after ${waited}ms`);
            break;
          }
          
          // Wait a bit and try again
          await new Promise(resolve => setTimeout(resolve, waitInterval));
          waited += waitInterval;
        }
        
        if (!flagsValid) {
          console.log(`[node-service] SDK still doesn't have valid flag data after ${maxWaitTime}ms wait`);
        }
        
        // Now evaluate the flag
        message = await ldClient.variation('user-message', context, 'Fallback: Flag not found or SDK offline');
        
        // Calculate hash value for bucketing demonstration
        try {
          // Get flag configuration to extract salt
          const store = getInspectableStore();
          if (store) {
            const storeData = store.inspect();
            const flagConfig = storeData.features?.['user-message'];
            
            // Use the flag's salt property directly (LaunchDarkly's approach)
            // The salt is a property in the flag configuration
            const salt = flagConfig?.salt || 'user-message';
            
            // Calculate hash value
            const hashResult = hashExposer.expose({
              flagKey: 'user-message',
              contextKey: context.user.key,
              salt: salt
            });
            
            if (!hashResult.error) {
              hashInfo = {
                hashValue: hashResult.hashValue,
                bucketValue: hashResult.bucketValue,
                salt: hashResult.salt
              };
            }
          }
        } catch (hashError) {
          console.error('[Hash Calculation] Error calculating hash value:', hashError);
        }
        
        const nodeServiceContext = clientInfo.req.session.nodeServiceContext;
        const contextKey = `node-service|${context.user.key}`;
        const lastValue = lastFlagValues.get(contextKey);
        if (lastValue !== undefined && lastValue !== message) {
          console.log(`=== Node Service Flag Evaluation Changed ===`);
          console.log(`Flag: user-message`);
          console.log(`Context: ${context.user.anonymous ? 'Anonymous' : 'Custom'} (${context.user.key})`);
          console.log(`Previous value: "${lastValue}"`);
          console.log(`New value: "${message}"`);
          if (hashInfo) {
            console.log(`Hash Value: ${hashInfo.hashValue}`);
            console.log(`Bucket Value: ${hashInfo.bucketValue}`);
          }
          console.log(`==========================================`);
        }
        lastFlagValues.set(contextKey, message);
      }
    } catch (error) {
      console.error('Error evaluating feature flag for Node service:', error);
      message = 'Flag Evaluation Error: ' + error.message + '\n\nUsing fallback variation: "Fallback: Flag not found or SDK offline"';
    }
    
    clientInfo.res.write(`data: ${JSON.stringify({ message, hashInfo })}\n\n`);
  }

  // Broadcast message to all Node.js service clients
  async function broadcastNodeServiceMessage() {
    console.log(`Broadcasting to ${nodeSseClients.size} Node.js service clients`);
    for (const clientInfo of nodeSseClients) {
      await sendNodeServiceMessage(clientInfo);
    }
  }

  // POST endpoint to update Node.js service context
  app.post('/api/node/context', express.json(), async (req, res) => {
    try {
      const { type, email, name, location } = req.body;
      
      if (type === 'custom') {
        if (!email || email.trim() === '') {
          return res.status(400).json({ success: false, error: 'Email is required for custom context' });
        }
        
        req.session.nodeServiceContext = {
          type: 'custom',
          key: email,
          email: email,
          anonymous: false
        };
        
        if (name && name.trim() !== '') {
          req.session.nodeServiceContext.name = name;
        }
        if (location && location.trim() !== '') {
          req.session.nodeServiceContext.location = location;
        }
      } else {
        // Anonymous context
        // Only generate new key if switching from custom to anonymous or if no context exists
        const needsNewKey = !req.session.nodeServiceContext || 
                           req.session.nodeServiceContext.type === 'custom' ||
                           !req.session.nodeServiceContext.key.startsWith('node-anon-');
        
        req.session.nodeServiceContext = {
          type: 'anonymous',
          key: needsNewKey ? `node-anon-${crypto.randomUUID()}` : req.session.nodeServiceContext.key,
          anonymous: true
        };
        
        if (location && location.trim() !== '') {
          req.session.nodeServiceContext.location = location;
        }
      }
      
      console.log(`Node.js service context updated: ${req.session.nodeServiceContext.type} (${req.session.nodeServiceContext.key})`);
      if (req.session.nodeServiceContext.location) {
        console.log(`  Location: ${req.session.nodeServiceContext.location}`);
      }
      
      // Store context in in-memory store so SSE connections can access it
      const contextKey = req.session.nodeServiceContext.key;
      nodeContextStore.set(contextKey, { ...req.session.nodeServiceContext });
      console.log(`[Context Store] Saved context for key: ${contextKey}`);
      console.log(`[Context Store] Context data:`, JSON.stringify(nodeContextStore.get(contextKey), null, 2));
      
      // Save session explicitly to ensure it's persisted
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
          return res.status(500).json({ success: false, error: 'Failed to save session' });
        }
        
        // Broadcast updated flag value to all connected clients
        broadcastNodeServiceMessage();
        
        // Return the saved context so the UI can confirm what was saved
        res.json({ 
          success: true,
          context: {
            type: req.session.nodeServiceContext.type,
            key: req.session.nodeServiceContext.key,
            email: req.session.nodeServiceContext.email || null,
            name: req.session.nodeServiceContext.name || null,
            location: req.session.nodeServiceContext.location || null,
            anonymous: req.session.nodeServiceContext.anonymous || false
          }
        });
      });
    } catch (error) {
      console.error('Error updating Node.js service context:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET endpoint for Node.js service status
  app.get('/api/node/status', (req, res) => {
    const ldClient = getLaunchDarklyClient();
    const initError = getInitializationError();
    const store = getInspectableStore();
    
    // Check if client is initialized using the SDK's built-in method
    const isInitialized = ldClient ? ldClient.initialized() : false;
    
    // Also check if the store has been initialized with data
    const storeHasData = store ? store.initialized : false;
    
    // Consider connected if either SDK reports initialized OR store has data
    const connected = (isInitialized || storeHasData) && !initError;
    
    res.json({
      connected: connected,
      mode: 'Proxy Mode',
      sdkVersion: 'Node.js SDK',
      error: initError || null
    });
  });

  // GET endpoint for Node.js service current context
  app.get('/api/node/context', (req, res) => {
    const nodeServiceContext = req.session.nodeServiceContext;
    
    res.json({
      type: nodeServiceContext.type,
      key: nodeServiceContext.key,
      email: nodeServiceContext.email || null,
      name: nodeServiceContext.name || null,
      location: nodeServiceContext.location || null,
      anonymous: nodeServiceContext.anonymous || false
    });
  });

  // POST endpoint to test Node.js flag evaluation
  app.post('/api/node/test-evaluation', express.json(), async (req, res) => {
    try {
      console.log('=== Test Evaluation Request ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const ldClient = getLaunchDarklyClient();
      
      if (!ldClient) {
        const initError = getInitializationError();
        return res.status(500).json({
          success: false,
          error: initError || 'SDK not initialized'
        });
      }
      
      // Use context from request body if provided, otherwise use session
      let nodeServiceContext;
      if (req.body && req.body.context) {
        // Use the context sent from the dashboard
        nodeServiceContext = req.body.context;
        console.log('Using context from request body');
      } else {
        // Fallback to session context
        nodeServiceContext = req.session.nodeServiceContext;
        console.log('Using context from session');
      }
      
      console.log('Node service context:', JSON.stringify(nodeServiceContext, null, 2));
      
      // Build context from the provided or session context
      const context = buildNodeServiceContext({ session: { nodeServiceContext } });
      
      // Log context info
      console.log('=== Test Flag Evaluation ===');
      console.log(`Node.js SDK: Context Type: ${nodeServiceContext.type}`);
      console.log(`Node.js SDK: Context Key: ${context.user.key}`);
      if (nodeServiceContext.name) {
        console.log(`Node.js SDK: Context Name: ${nodeServiceContext.name}`);
      }
      if (nodeServiceContext.email) {
        console.log(`Node.js SDK: Context Email: ${nodeServiceContext.email}`);
      }
      if (nodeServiceContext.location) {
        console.log(`Node.js SDK: Context Location: ${nodeServiceContext.location} ✓`);
      }
      console.log(`Node.js SDK: Context Anonymous: ${nodeServiceContext.anonymous || false}`);
      
      // Evaluate flag
      console.log("Node.js SDK: Evaluating flag 'user-message'");
      const flagValue = await ldClient.variation('user-message', context, 'Fallback: Flag not found');
      console.log(`Node.js SDK: Flag evaluation result: ${flagValue}`);
      
      // Calculate hash value for bucketing demonstration
      let hashInfo = null;
      try {
        const store = getInspectableStore();
        if (store) {
          const storeData = store.inspect();
          const flagConfig = storeData.features?.['user-message'];
          
          // Use the flag's salt property directly (LaunchDarkly's approach)
          const salt = flagConfig?.salt || 'user-message';
          
          // Calculate hash value
          const hashResult = hashExposer.expose({
            flagKey: 'user-message',
            contextKey: context.user.key,
            salt: salt
          });
          
          if (!hashResult.error) {
            hashInfo = {
              hashValue: hashResult.hashValue,
              bucketValue: hashResult.bucketValue,
              salt: hashResult.salt
            };
            console.log(`Hash Value: ${hashInfo.hashValue}`);
            console.log(`Bucket Value: ${hashInfo.bucketValue}`);
          }
        }
      } catch (hashError) {
        console.error('Error calculating hash value:', hashError);
      }
      
      console.log('===========================');
      
      res.json({
        success: true,
        flagValue: flagValue,
        hashInfo: hashInfo,
        context: {
          type: nodeServiceContext.type,
          key: context.user.key,
          name: nodeServiceContext.name || null,
          email: nodeServiceContext.email || null,
          location: nodeServiceContext.location || null,
          anonymous: nodeServiceContext.anonymous || false
        }
      });
    } catch (error) {
      console.error('Node.js SDK ERROR during test evaluation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Helper function to get flags from feature store
  function getAllFlagsFromStore(store) {
    return new Promise((resolve, reject) => {
      // Check if store has the all() method
      if (!store || typeof store.all !== 'function') {
        reject(new Error('Feature store does not support all() method'));
        return;
      }
      
      console.log('Calling store.all("features", callback)...');
      
      store.all('features', (result) => {
        console.log('store.all callback invoked with single parameter');
        console.log('  result:', result);
        console.log('  result type:', typeof result);
        console.log('  result is null:', result === null);
        console.log('  result is undefined:', result === undefined);
        console.log('  result keys:', result ? Object.keys(result) : 'N/A');
        
        // The callback might only receive one parameter (the data)
        // Check if result looks like flag data (has keys) or is empty/error
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const keys = Object.keys(result);
          console.log('Resolving with data, keys:', keys);
          resolve(result);
        } else {
          console.log('No data returned, resolving with empty object');
          resolve({});
        }
      });
    });
  }

  // Endpoint to get SDK data store (raw flag configurations)
  app.post('/api/node/sdk-cache', express.json(), async (req, res) => {
    try {
      const ldClient = getLaunchDarklyClient();
      
      if (!ldClient) {
        const initError = getInitializationError();
        return res.status(500).json({
          success: false,
          error: initError || 'SDK not initialized'
        });
      }
      
      console.log('=== SDK Data Store Request ===');
      
      // Get the inspectable store
      const store = getInspectableStore();
      
      if (!store) {
        return res.status(500).json({
          success: false,
          error: 'Inspectable store not available'
        });
      }
      
      // Get raw flag configurations from the store
      const storeData = store.inspect();
      const flags = storeData.features || {};
      
      console.log('Raw flag configurations:', Object.keys(flags).length, 'flags');
      console.log('Flag keys:', Object.keys(flags));
      
      // Debug: log the structure of one flag
      if (Object.keys(flags).length > 0) {
        const firstFlagKey = Object.keys(flags)[0];
        console.log('Sample flag structure for', firstFlagKey, ':', JSON.stringify(flags[firstFlagKey], null, 2));
      }
      
      res.json({
        success: true,
        flags: flags,
        storeType: 'custom-inspectable',
        contextIndependent: true
      });
    } catch (error) {
      console.error('Error getting flags from data store:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to access data store'
      });
    }
  });

  // SSE stream endpoint for Node.js SDK cache updates
  let nodeSdkCacheClients = [];
  
  app.get('/api/node/sdk-cache/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const ldClient = getLaunchDarklyClient();
    const store = getInspectableStore();
    
    if (!ldClient || !store) {
      res.write(`data: ${JSON.stringify({ error: 'SDK not initialized' })}\n\n`);
      return res.end();
    }
    
    // Add this client to the list
    nodeSdkCacheClients.push(res);
    console.log(`[Node SDK Cache] SSE client connected (${nodeSdkCacheClients.length} total)`);
    
    // Send initial data immediately
    const storeData = store.inspect();
    const flags = storeData.features || {};
    const data = JSON.stringify({
      flags: flags,
      timestamp: Date.now()
    });
    console.log(`[Node SDK Cache] Sending initial data: ${Object.keys(flags).length} flags`);
    res.write(`data: ${data}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
      nodeSdkCacheClients = nodeSdkCacheClients.filter(client => client !== res);
      console.log(`[Node SDK Cache] SSE client disconnected (${nodeSdkCacheClients.length} remaining)`);
    });
  });
  
  // Register flag change listener to broadcast updates
  onFlagChange((settings) => {
    if (nodeSdkCacheClients.length === 0) {
      return;
    }
    
    const store = getInspectableStore();
    if (!store) {
      return;
    }
    
    const storeData = store.inspect();
    const flags = storeData.features || {};
    const data = JSON.stringify({
      flags: flags,
      timestamp: Date.now()
    });
    
    console.log(`[Node SDK Cache] Broadcasting update to ${nodeSdkCacheClients.length} clients`);
    
    // Send to all connected clients
    nodeSdkCacheClients = nodeSdkCacheClients.filter(client => {
      try {
        client.write(`data: ${data}\n\n`);
        return true;
      } catch (error) {
        console.log('[Node SDK Cache] Client disconnected during broadcast');
        return false;
      }
    });
  });

  
  return app;
}

module.exports = { createApp };
