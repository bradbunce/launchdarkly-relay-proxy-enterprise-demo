/**
 * Load Testing Script for LaunchDarkly Relay Proxy
 * 
 * This script simulates multiple SDK clients connecting to the Relay Proxy
 * and evaluating flags to test performance under load.
 * 
 * Usage: node load-test.js [options]
 * Options:
 *   --clients <number>    Number of simulated SDK clients (default: 10)
 *   --duration <seconds>  Test duration in seconds (default: 60)
 *   --interval <ms>       Flag evaluation interval in milliseconds (default: 1000)
 */

require('dotenv').config();
const LD = require('@launchdarkly/node-server-sdk');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? parseInt(args[index + 1]) : defaultValue;
};

const NUM_CLIENTS = getArg('--clients', 10);
const DURATION_SECONDS = getArg('--duration', 60);
const EVAL_INTERVAL_MS = getArg('--interval', 1000);

const RELAY_PROXY_URL = process.env.RELAY_PROXY_URL || 'http://localhost:8030';
const SDK_KEY = process.env.LAUNCHDARKLY_SDK_KEY;

if (!SDK_KEY) {
  console.error('Error: LAUNCHDARKLY_SDK_KEY environment variable is required');
  process.exit(1);
}

// Statistics tracking
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

// Create a simulated SDK client
async function createClient(clientId) {
  try {
    console.log(`[Client ${clientId}] Initializing...`);
    
    const client = LD.init(SDK_KEY, {
      baseUri: RELAY_PROXY_URL,
      streamUri: RELAY_PROXY_URL,
      eventsUri: RELAY_PROXY_URL
    });

    await client.waitForInitialization({ timeout: 10 });
    console.log(`[Client ${clientId}] Connected successfully`);
    stats.clientsConnected++;
    
    return client;
  } catch (error) {
    console.error(`[Client ${clientId}] Failed to initialize:`, error.message);
    stats.clientsFailed++;
    return null;
  }
}

// Evaluate flags continuously
async function evaluateFlags(client, clientId) {
  const context = {
    kind: 'multi',
    user: {
      key: `load-test-user-${clientId}`,
      anonymous: true
    },
    container: {
      key: 'load-test'
    }
  };

  const interval = setInterval(async () => {
    const startTime = Date.now();
    
    try {
      await client.variation('user-message', context, 'fallback');
      const latency = Date.now() - startTime;
      
      stats.totalEvaluations++;
      stats.successfulEvaluations++;
      stats.totalLatency += latency;
      stats.minLatency = Math.min(stats.minLatency, latency);
      stats.maxLatency = Math.max(stats.maxLatency, latency);
    } catch (error) {
      stats.totalEvaluations++;
      stats.failedEvaluations++;
      console.error(`[Client ${clientId}] Evaluation failed:`, error.message);
    }
  }, EVAL_INTERVAL_MS);

  return interval;
}

// Print statistics
function printStats() {
  const avgLatency = stats.totalEvaluations > 0 
    ? (stats.totalLatency / stats.successfulEvaluations).toFixed(2) 
    : 0;
  
  console.log('\n=== Load Test Statistics ===');
  console.log(`Clients Connected: ${stats.clientsConnected}/${NUM_CLIENTS}`);
  console.log(`Clients Failed: ${stats.clientsFailed}`);
  console.log(`Total Evaluations: ${stats.totalEvaluations}`);
  console.log(`Successful: ${stats.successfulEvaluations}`);
  console.log(`Failed: ${stats.failedEvaluations}`);
  console.log(`Success Rate: ${((stats.successfulEvaluations / stats.totalEvaluations) * 100).toFixed(2)}%`);
  console.log(`\nLatency:`);
  console.log(`  Min: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`);
  console.log(`  Max: ${stats.maxLatency}ms`);
  console.log(`  Avg: ${avgLatency}ms`);
  console.log(`\nThroughput: ${(stats.successfulEvaluations / DURATION_SECONDS).toFixed(2)} evaluations/sec`);
  console.log('============================\n');
}

// Main load test function
async function runLoadTest() {
  console.log('=== LaunchDarkly Relay Proxy Load Test ===');
  console.log(`Configuration:`);
  console.log(`  Clients: ${NUM_CLIENTS}`);
  console.log(`  Duration: ${DURATION_SECONDS} seconds`);
  console.log(`  Evaluation Interval: ${EVAL_INTERVAL_MS}ms`);
  console.log(`  Relay Proxy: ${RELAY_PROXY_URL}`);
  console.log('==========================================\n');

  const clients = [];
  const intervals = [];

  // Initialize all clients
  console.log('Initializing clients...\n');
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const client = await createClient(i + 1);
    if (client) {
      clients.push(client);
      const interval = await evaluateFlags(client, i + 1);
      intervals.push(interval);
    }
  }

  console.log(`\n${clients.length} clients running. Test will run for ${DURATION_SECONDS} seconds...\n`);

  // Print stats every 10 seconds
  const statsInterval = setInterval(printStats, 10000);

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000));

  // Clean up
  console.log('\nStopping test...');
  intervals.forEach(interval => clearInterval(interval));
  clearInterval(statsInterval);

  // Close all clients
  for (const client of clients) {
    await client.flush();
    await client.close();
  }

  // Print final stats
  printStats();
  
  console.log('Load test complete!');
  process.exit(0);
}

// Run the load test
runLoadTest().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});
