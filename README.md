# LaunchDarkly Relay Proxy Enterprise Demo

A comprehensive demonstration application showcasing the LaunchDarkly Node.js server-side SDK integration with the LaunchDarkly Relay Proxy Enterprise. This application provides a full-featured demo environment with real-time flag updates, load testing, and performance monitoring.

## Features

### Core Functionality
- **Multi-Variate Feature Flags**: Demonstrates flag evaluation with multiple variations
- **Real-Time Updates**: Server-Sent Events (SSE) for instant flag changes without page refresh
- **Multi-Context Evaluation**: Supports both anonymous and custom user contexts with container context
- **Geolocation**: Automatic browser-based location detection for targeting
- **Singleton SDK Pattern**: Efficient SDK client management with automatic recovery

### Demo Capabilities
- **Interactive UI**: Modern web interface with LaunchDarkly branding
- **Context Management**: Switch between anonymous and custom user contexts
- **Live Container Logs**: Real-time viewing of app and relay proxy logs
- **Redis Monitor**: Live stream of all Redis commands showing feature flag operations
- **Relay Proxy Status**: Comprehensive status dashboard with health checks
- **Performance Metrics**: Real-time CPU and memory monitoring
- **Load Testing**: Built-in load testing tool with live results

### Technical Features
- **Graceful Degradation**: Continues operation when relay proxy is unavailable
- **Error Handling**: Clear error messages with fallback value display
- **Flag Change Detection**: Detailed logging of flag configuration changes
- **Docker Integration**: Full containerized environment with Docker Compose
- **ARM64 Compatible**: Runs on Apple Silicon and ARM64 architectures

## Prerequisites

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **LaunchDarkly Account**: With SDK key and Relay Proxy configuration key

## Quick Start

### 1. Clone and Configure

```bash
# Navigate to the project directory
cd launchdarkly-relay-proxy-enterprise-demo

# Copy the example environment file
cp .env.example .env

# Edit .env and add your LaunchDarkly credentials
```

Required environment variables:
```env
LAUNCHDARKLY_SDK_KEY=sdk-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
RELAY_PROXY_CONFIG_KEY=rel-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Optional configuration:
```env
# Redis prefix (must match your environment ID from LaunchDarkly)
REDIS_PREFIX=ld-flags-'your-environment-id'
```

### 2. Create Feature Flag

In your LaunchDarkly dashboard:
1. Create a new flag with key: `user-message`
2. Set it as a multi-variate string flag
3. Add three variations:
   - "Hello from LaunchDarkly!"
   - "Welcome to the demo!"
   - "Greetings from the Relay Proxy!"

### 3. Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access the application
# Dashboard UI: http://localhost:8000 (main interface)
# Node.js API: http://localhost:3000 (backend only)
# API service: http://localhost:4000 (backend only)
# PHP API: http://localhost:8080 (backend only)
```

### 4. Changing Configuration

After modifying `.env` file:

```bash
# Stop and remove all containers
docker-compose down

# Start fresh containers with new environment variables
docker-compose up -d
```

Or to recreate specific containers:

```bash
docker-compose up -d --force-recreate app php
```

### 5. Stop the Application

```bash
docker-compose down
```

## Application Features

### User Interface

The demo application provides:

1. **Feature Flag Display**: Shows the current value of the `user-message` flag
2. **SDK Data Store Display**: View raw flag configurations cached by the SDK (context-independent)
3. **User Context Selector**: Switch between anonymous and custom user contexts
4. **Container Logs**: Real-time logs from both app-dev and relay-proxy containers
5. **Relay Proxy Status**: Detailed status information and performance metrics
6. **Load Testing**: Built-in load testing tool

### SDK Data Store Display

Each service panel includes an "SDK Data Store" section that displays the raw flag configurations cached locally by the SDK:

**What You Can See:**
- **Raw Flag Configurations**: Complete flag structure as stored in the SDK's internal data store
- **Variations**: All possible flag values with their indices
- **Targeting Rules**: Detailed rules with clauses, operators, and conditions
- **Percentage Rollouts**: Rollout configurations with variation weights
- **Individual Targets**: User keys explicitly targeted to specific variations
- **Prerequisites**: Flag dependencies if configured
- **Version Information**: Flag version numbers and enabled/disabled state

**Key Features:**
- **Context-Independent**: Shows raw flag data, not evaluated values for specific users
- **Always Visible**: Automatically displays when the SDK initializes
- **Auto-Refresh**: Automatically updates when flags change in LaunchDarkly
- **Real-Time Updates**: SSE keeps the display current without manual interaction

**Data Sources by Service:**
- **Node.js**: Shows data from the SDK's in-memory feature store (Proxy Mode)
- **PHP**: Shows data from the Redis data store (Daemon Mode)
- **Redis**: Shows raw flag data stored in Redis by the Relay Proxy

**Redis Panel:**
The Redis panel includes a dedicated "Redis Data Store" display that shows the raw flag configurations stored in Redis by the Relay Proxy. This provides visibility into:
- The shared data store used by the PHP SDK in daemon mode
- The cache used by the Relay Proxy for all environments
- The same flag data that multiple applications can read from
- Real-time updates as the Relay Proxy refreshes flag data from LaunchDarkly

This feature is useful for:
- Understanding how flags are structured internally
- Debugging targeting rules and rollouts
- Verifying flag configurations are cached correctly
- Learning how LaunchDarkly stores flag data
- Monitoring the shared Redis data store used by multiple services

### User Context Management

**Anonymous Context:**
- Automatically generated unique key per session
- Optional geolocation (browser-based)
- Multi-context with container kind

**Custom Context:**
- Email address (required, used as context key)
- Name (optional)
- Automatic geolocation detection
- Multi-context with container kind

### Real-Time Flag Updates

The application uses Server-Sent Events (SSE) to push flag changes instantly:
- No page refresh required
- Automatic reconnection on connection loss
- Detailed logging of flag changes in console

**SSE Connection Behavior:**

The dashboard maintains persistent SSE connections to both Node.js and PHP services for real-time flag updates:

**Node.js (Proxy Mode):**
- Receives instant push updates via streaming from Relay Proxy
- Updates appear immediately when flags change in LaunchDarkly
- Connection stays open indefinitely

**PHP (Daemon Mode with Polling):**
- Polls Redis every 5 seconds for flag changes
- Updates appear within 5 seconds of flag changes in LaunchDarkly
- Demonstrates how daemon mode can still provide near-real-time updates
- Connection closes after 5 minutes and automatically reconnects

**Connection Management:**
- **Connection Timeout**: PHP SSE connections automatically close after 5 minutes
- **Automatic Reconnection**: The dashboard seamlessly reconnects when a connection closes
- **Heartbeat Monitoring**: Connections send heartbeats to detect disconnects
- **Why This Matters**: Prevents PHP-FPM worker exhaustion and memory leaks from indefinite connections

**What You'll See:**
- Every 5 minutes, the PHP connection will show "Connection timeout - please refresh"
- The dashboard automatically reconnects within seconds
- This is **expected behavior** and ensures long-term stability
- Node.js connections remain open indefinitely (handled differently by Node.js runtime)

**Connection Lifecycle:**
1. Initial connection established
2. Flag value sent immediately
3. Heartbeats sent every 15 seconds
4. After 5 minutes, PHP connection closes gracefully
5. Dashboard reconnects automatically
6. Process repeats

This design ensures the demo can run for extended periods without manual intervention or resource issues.

### Container Logs

View real-time logs from containers:
- **app-dev**: Application and SDK logs
- **relay-proxy**: Relay proxy connection and event logs
- **redis monitor**: Live Redis commands showing all operations in real-time
- **Clear button**: Truncates container logs or clears monitor display
- **Auto-refresh**: Updates every 2 seconds (logs) or streams live (Redis monitor)

### Relay Proxy Status

Comprehensive status dashboard showing:

**Performance Metrics:**
- CPU usage percentage
- Memory usage and percentage
- Real-time updates

**Overall Status:**
- Health status (healthy/degraded)
- Relay proxy version
- SDK client version

**Environment Status:**
- Connection state (VALID/INITIALIZING/INTERRUPTED/OFF)
- Data store status
- Big Segments status
- Last error information

### Load Testing

Built-in load testing tool to measure SDK performance for both Node.js and PHP applications:

**Configuration:**
- Target Service: Node.js (Proxy Mode) or PHP (Daemon Mode)
- Number of Requests: 1-1000 total flag evaluations
- Concurrency: 1-100 simultaneous requests

**Metrics:**
- Total requests completed
- Successful evaluations
- Failed evaluations
- Average response time (milliseconds)
- Requests per second (throughput)

**Performance Comparison:**
- **Node.js (Proxy Mode)**: ~10-50ms average latency, moderate throughput
  - Evaluates flags through Relay Proxy over HTTP
  - Demonstrates real-world network latency
  - Suitable for interactive applications
  
- **PHP (Daemon Mode)**: <1ms average latency, very high throughput (4000+ req/sec)
  - Reads flags directly from Redis
  - Minimal latency, maximum performance
  - Ideal for high-throughput scenarios

**How to Use:**
1. Open the dashboard at http://localhost:8000
2. Scroll to the "Relay Proxy Load Test" panel
3. Select target service (Node.js or PHP)
4. Configure number of requests and concurrency level
5. Click "Start Test" to begin
6. View real-time results in the output panel

**Example Results:**
```
Node.js Load Test:
Total Requests: 100
Successful: 100
Failed: 0
Average Response Time: 15.23ms
Requests/sec: 250.45

PHP Load Test:
Total Requests: 100
Successful: 100
Failed: 0
Average Response Time: 0.23ms
Requests/sec: 4118.44
```

## Architecture

### 6-Container Architecture

This application uses a microservices architecture with six specialized containers:

**dashboard** (Dashboard UI Container):
- Nginx Alpine
- Serves static web UI (HTML, CSS, JavaScript)
- Port: 8000
- Purpose: User interface for monitoring and demonstration

**api-service** (API Service Container):
- Node.js 18 Alpine
- Express web server
- Centralized API gateway for status checks and operations
- Docker CLI for container management
- Port: 4000
- Purpose: Cross-service communication and monitoring

**app-dev** (Node.js Application Container):
- Node.js 24 Alpine
- Express web server
- LaunchDarkly SDK v9.10.5
- **Fixed Mode**: Proxy Mode only
- Port: 3000
- Purpose: LaunchDarkly Node.js SDK demonstration

**php-app-dev** (PHP Application Container):
- PHP 8.3-FPM Alpine
- Nginx web server
- LaunchDarkly PHP SDK v6.4+
- **Fixed Mode**: Daemon Mode (Redis + Events) only
- Port: 8080
- Purpose: LaunchDarkly PHP SDK demonstration

**relay-proxy** (Relay Proxy Container):
- LaunchDarkly Relay Proxy v8.16.4
- AutoConfig mode
- Event forwarding enabled
- Redis integration for persistent storage
- Port: 8030
- Purpose: Feature flag caching and event forwarding

**redis** (Redis Container):
- Redis 7 Alpine
- Persistent data store for feature flags
- AOF (Append-Only File) persistence enabled
- Health checks every 5 seconds
- Port: 6379 (internal Docker network)
- Volume: redis-data for persistent storage
- Purpose: Shared data store for feature flags

### Port Mappings

| Service | Port | Purpose |
|---------|------|---------|
| Dashboard | 8000 | Web UI access |
| API Service | 4000 | API endpoints for status and operations |
| Node.js App | 3000 | SDK demonstration endpoints |
| PHP App | 8080 | PHP SDK demonstration |
| Relay Proxy | 8030 | LaunchDarkly Relay Proxy |
| Redis | 6379 | Internal only (no external port) |

### Network

All containers communicate via a custom Docker bridge network (`launchdarkly-network`).

### Multi-Language SDK Integration

This demo showcases SDK integration with a shared Redis backend, with each application using a distinct, optimized integration pattern:

**Node.js Application** (Proxy Mode only):
- All SDK traffic goes through the Relay Proxy
- Receives real-time flag updates via streaming
- Sends analytics events through the Relay Proxy
- Backend API accessible at http://localhost:3000

**PHP Application** (Daemon Mode only):
- Reads flags directly from Redis for high-performance evaluation
- Sends analytics events through the Relay Proxy
- No direct LaunchDarkly API connections for flag evaluation
- Backend API accessible at http://localhost:8080

Both applications:
- Evaluate the same feature flags from the shared Redis store
- Send analytics events to LaunchDarkly through the Relay Proxy
- Demonstrate how multiple SDKs in different languages work together in a unified architecture

### API Service Endpoints

The API service provides centralized endpoints for monitoring and operations:

**Status Endpoints:**
- `GET /api/relay-status` - Relay Proxy connection status
- `GET /api/redis/status` - Redis connectivity check
- `GET /api/node/status` - Node.js application status
- `GET /api/php/status` - PHP application status

**Operations Endpoints:**
- `GET /api/logs/:container` - Retrieve container logs (last 50 lines)
- `GET /api/relay-metrics` - Relay Proxy CPU and memory metrics

**Health Check:**
- `GET /health` - API service health status

All API endpoints are accessible at http://localhost:4000

For detailed API documentation, see [api-service/README.md](api-service/README.md)

### Redis Integration

The relay proxy uses Redis as a persistent data store for caching feature flag configurations. This architecture provides a clear separation of concerns with each application using its optimal integration pattern.

**Architecture Diagram:**

```
┌─────────────────┐
│  Dashboard      │  (Port 8000)
│  Static UI      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Service    │  (Port 4000)
│  Status/Metrics │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Node.js App    │      │  PHP App        │
│  (Relay Proxy   │      │  (Daemon Mode)  │
│   Mode Only)    │      │  Redis + Events │
│  (Port 3000)    │      │  (Port 8080)    │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │ All SDK Traffic        │ Direct Read
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│  Relay Proxy    │─────►│  Redis          │
│  (Port 8030)    │      │  (Port 6379)    │
└────────┬────────┘      └─────────────────┘
         │                        │
         │ Events                 │ Events
         └────────────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  LaunchDarkly   │
         │  Cloud Service  │
         └─────────────────┘
```

**Key Architecture Points:**
- **Dashboard**: Serves static UI, fetches data from API service
- **API Service**: Centralized gateway for status checks and operations
- **Node.js**: Single path through Relay Proxy (streaming + events)
- **PHP**: Direct Redis reads for flags, Relay Proxy for events only
- **Simplified Configuration**: No mode switching logic in either application
- **Optimized Performance**: Each application uses its ideal integration pattern

**Benefits of This Architecture:**

**Data Persistence**: Feature flag data persists across container restarts, reducing initialization time and API calls to LaunchDarkly.

**Persistence Mechanism**: Redis uses AOF (Append-Only File) persistence, which logs every write operation to disk. The data is stored in a Docker volume (`redis-data`) that survives container removal and recreation.

**Relay Proxy Configuration**: The relay proxy is configured with:
- `USE_REDIS=1` - Enables Redis as the persistent store
- `REDIS_URL=redis://redis:6379` - Connection string using internal hostname
- `ENV_DATASTORE_PREFIX=ld-flags-'$CID'` - Prefix for environment-specific keys

**SDK Configuration Options:**

The LaunchDarkly SDK can be configured to use Redis directly as a feature store:

```javascript
// Option 1: Via Relay Proxy (current demo configuration)
const client = LD.init(sdkKey, {
  baseUri: 'http://relay-proxy:8030',
  streamUri: 'http://relay-proxy:8030',
  eventsUri: 'http://relay-proxy:8030'
});

// Note: This demo uses Proxy Mode (shown above) for Node.js
// For daemon mode with direct Redis access (like the PHP app), you would use:
// const RedisFeatureStore = require('launchdarkly-node-server-sdk/integrations').Redis;
// const client = LD.init(sdkKey, {
//   featureStore: RedisFeatureStore({
//     redisOpts: { host: 'redis', port: 6379 },
//     prefix: 'ld-flags',
//     cacheTTL: 30
//   })
// });
```

**Automatic Configuration**: The relay proxy automatically discovers and caches all environments configured via the `AUTO_CONFIG_KEY`, storing each environment's data separately in Redis with environment-specific prefixes.

**Live Monitoring**: The UI includes a Redis monitor console that streams all Redis commands in real-time using `redis-cli MONITOR`. This allows you to watch:
- GET/SET operations for feature flag data
- Key operations when flags are updated
- Connection health checks (PING commands every 5 seconds)
- All other Redis operations in the system

**Data Structure**: Feature flags are stored in Redis with keys like:
- `ld-flags-'<environment-id>':features` - Feature flag configurations
- `ld-flags-'<environment-id>':segments` - User segment definitions
- `ld-flags-'<environment-id>':$inited` - Initialization markers

### Verifying Redis Connectivity

To verify Redis is working correctly:

```bash
# Check Redis container is running and healthy
docker-compose ps redis

# View Redis logs
docker-compose logs redis

# Connect to Redis CLI and check stored data
docker exec redis redis-cli KEYS "*"

# Check specific feature flag data
docker exec redis redis-cli GET "ld-flags-'<environment-id>':features"

# Monitor Redis commands in real-time (also available in UI)
docker exec redis redis-cli MONITOR

# Check relay proxy logs for Redis connection
docker-compose logs relay-proxy | grep -i redis

# Verify data persistence
# 1. Let services run for a minute to cache data
# 2. Check data exists: docker exec redis redis-cli KEYS "*"
# 3. Restart Redis: docker-compose restart redis
# 4. Wait for Redis to be healthy: docker-compose ps redis
# 5. Verify data persists: docker exec redis redis-cli KEYS "*"
```

**Using the UI Redis Monitor:**

The application UI includes a live Redis monitor console that shows all Redis commands in real-time:
1. Open the dashboard at http://localhost:8000
2. Look at the rightmost console panel labeled "redis monitor (live commands)"
3. Watch as commands stream in real-time
4. Trigger activity by refreshing the page or changing user context
5. Click "Clear" to reset the monitor display

### SDK Configuration

The SDK is configured as a singleton with:
- Automatic initialization on startup
- Background retry on connection failure
- Automatic recovery when relay proxy becomes available
- Event flushing on shutdown
- Flag change listeners for real-time updates

## SDK Configuration Examples

The Node.js and PHP applications use distinct, optimized integration patterns with LaunchDarkly.

### Node.js SDK - Proxy Mode

The Node.js application always uses Proxy mode for all SDK operations:

```javascript
const LD = require('@launchdarkly/node-server-sdk');

const client = LD.init(sdkKey, {
  baseUri: 'http://relay-proxy:8030',      // Flag polling endpoint
  streamUri: 'http://relay-proxy:8030',    // Streaming updates endpoint
  eventsUri: 'http://relay-proxy:8030',    // Analytics events endpoint
  stream: true,                             // Enable streaming for real-time updates
  sendEvents: true                          // Send analytics events
});
```

**Key Points**:
- All three URIs point to the Relay Proxy
- Streaming enabled for real-time flag updates
- Events are sent through the Relay Proxy to LaunchDarkly
- Relay Proxy handles caching via Redis internally

### PHP SDK - Daemon Mode (Redis + Events)

The PHP application always uses daemon mode, reading flags from Redis while sending events:

```php
use LaunchDarkly\LDClient;
use LaunchDarkly\Integrations\Redis;

// Create Redis client
$redisClient = new Predis\Client([
    'scheme' => 'tcp',
    'host' => 'redis',
    'port' => 6379
]);

// Configure Redis feature requester
$featureStore = Redis::featureRequester($redisClient, [
    'prefix' => 'ld-flags-{environment-id}'  // Match Relay Proxy prefix
]);

// Initialize SDK in daemon mode with events
$client = new LDClient($sdkKey, [
    'feature_requester' => $featureStore,    // Read flags from Redis
    'send_events' => true,                    // Enable event sending
    'base_uri' => 'http://relay-proxy:8030', // Send events via Relay Proxy
    'use_ldd' => false                        // Allow event sending
]);
```

**Key Points**:
- `feature_requester` configured with Redis client
- Flags are read directly from Redis (no HTTP calls for flags)
- `send_events => true` enables analytics
- `base_uri` routes events through Relay Proxy
- `use_ldd => false` allows event sending (pure daemon mode would disable this)
- Redis prefix must match Relay Proxy's `ENV_DATASTORE_PREFIX`

### Redis Key Prefix Configuration

The Redis prefix must match between the Relay Proxy and SDK clients:

**Relay Proxy** (docker-compose.yml):
```yaml
environment:
  - ENV_DATASTORE_PREFIX=ld-flags-'$CID'
```

**PHP SDK** (.env):
```bash
REDIS_PREFIX=ld-flags-'6969a4b8e5069109d9807840'
```

**Finding Your Environment ID**:
```bash
# List all Redis keys
docker exec redis redis-cli KEYS "*"

# Look for keys like: ld-flags-'507f1f77bcf86cd799439011':features
# The environment ID is: 507f1f77bcf86cd799439011
```

### Configuration Comparison

| Feature | Node.js (Proxy Mode) | PHP (Daemon Mode) |
|---------|---------------------------|-------------------|
| Flag Source | Relay Proxy | Redis Direct |
| Real-time Updates | Yes (streaming) | Yes (polling every 5s) |
| Update Mechanism | Push (instant) | Poll (5-second delay) |
| Analytics Events | Yes | Yes |
| Network Latency | ~10-50ms | <1ms (Redis read) |
| LaunchDarkly API Calls | Via Relay Proxy | None (for flags) |
| Redis Dependency | Optional | Required |
| Best For | Real-time apps, standard setup | High-throughput, air-gapped |

## PHP Daemon Mode Integration

### What is Daemon Mode?

Daemon mode is a special LaunchDarkly SDK configuration where the SDK reads feature flags exclusively from a persistent store (Redis) without making any connections to LaunchDarkly's streaming or polling endpoints. This architecture provides several benefits:

**Key Characteristics**:
- **No LaunchDarkly API calls**: SDK reads only from Redis
- **No analytics events**: Event sending is disabled
- **High performance**: Sub-millisecond flag evaluations (no network latency)
- **Offline capable**: Works in air-gapped environments
- **Shared data**: Multiple applications can read from the same Redis store

**How It Differs from Standard SDK Operation**:

| Feature | Standard Mode (Node.js) | Daemon Mode (PHP) |
|---------|------------------------|-------------------|
| LaunchDarkly API Connection | Yes (via Relay Proxy) | No |
| Real-time Updates | Yes (streaming) | No (depends on Redis refresh) |
| Analytics Events | Yes | No |
| Network Latency | ~10-50ms | <1ms (Redis read) |
| Requires Relay Proxy | Yes | No (for flag evaluation) |
| Use Case | Interactive apps, real-time updates | High-throughput, air-gapped, multi-language |

### Architecture

The PHP application demonstrates daemon mode by reading feature flags from the same Redis instance that the Relay Proxy populates:

```
┌─────────────────┐      ┌─────────────────┐
│  Node.js App    │      │  PHP App        │
│  (Standard)     │      │  (Daemon Mode)  │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │ Via Relay Proxy        │ Direct Read
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│  Relay Proxy    │─────►│  Redis          │
│                 │      │  (Shared Store) │
└────────┬────────┘      └─────────────────┘
         │
         │ LaunchDarkly API
         ▼
┌─────────────────┐
│  LaunchDarkly   │
│  Cloud Service  │
└─────────────────┘
```

**Data Flow**:
1. Relay Proxy fetches flags from LaunchDarkly and stores in Redis
2. Node.js app connects to Relay Proxy via HTTP (Proxy Mode)
3. PHP app reads flags directly from Redis (Daemon Mode)

### Accessing the PHP Application

Once the services are running, access the PHP backend API at:

**URL**: http://localhost:8080

**Note**: The unified dashboard at http://localhost:8000 provides a visual interface for both Node.js and PHP services. The PHP API at port 8080 is primarily for backend operations and testing.

The PHP application displays:
- Current value of the `user-message` feature flag
- User context information
- Daemon mode status indicator
- Redis connection information
- Environment details

### Verifying PHP SDK is Reading from Redis

To verify the PHP SDK is correctly reading from Redis in daemon mode:

```bash
# 1. Check that PHP container is running
docker-compose ps php

# 2. View PHP application logs
docker-compose logs php

# 3. Verify Redis contains feature flag data
docker exec redis redis-cli KEYS "*"

# 4. Check specific flag data in Redis
docker exec redis redis-cli HGETALL "ld-flags-<environment-id>:features"

# 5. Access PHP app and verify it displays flag value
curl http://localhost:8080

# 6. Stop Relay Proxy to test daemon mode independence
docker-compose stop relay-proxy

# 7. Verify PHP app still works (reads from Redis cache)
curl http://localhost:8080

# 8. Check PHP logs show no LaunchDarkly API connection attempts
docker-compose logs php | grep -i "launchdarkly"

# 9. Restart Relay Proxy
docker-compose start relay-proxy
```

### Redis Architecture

The Relay Proxy and PHP application share the same Redis instance for feature flag data:

**Redis Key Structure**:
- Keys follow pattern: `ld-flags-{environment-id}:{data-type}`
- Example: `ld-flags-507f1f77bcf86cd799439011:features`
- The Relay Proxy and PHP SDK use the same key prefix for the target environment

**Benefits of This Architecture**:
- **Consistency**: Relay Proxy and PHP app always see the same flag values
- **Efficiency**: Single source of truth reduces API calls
- **Scalability**: Add more daemon-mode applications without increasing LaunchDarkly API load
- **Multi-language**: Demonstrates different SDK modes (Relay Proxy vs Daemon)

**How It Works**:
1. Relay Proxy populates Redis with flag data for all configured environments
2. Node.js SDK connects to Relay Proxy via HTTP (Proxy Mode - no direct Redis access)
3. PHP SDK reads directly from Redis using the same key prefix (Daemon Mode)
4. Relay Proxy uses Redis as its cache, PHP reads from that same cache
5. When flags change in LaunchDarkly, Relay Proxy updates Redis
6. PHP sees the updated values on next evaluation, Node.js gets updates via Relay Proxy

### Testing Multi-Language Consistency

To verify both applications return the same flag values:

```bash
# 1. Start all services
docker-compose up -d

# 2. Wait for services to initialize (30 seconds)
sleep 30

# 3. Access Node.js app
curl http://localhost:3000

# 4. Access PHP app
curl http://localhost:8080

# 5. Compare flag values - they should match

# 6. Change flag value in LaunchDarkly dashboard

# 7. Wait for Relay Proxy to update Redis (30 seconds)
sleep 30

# 8. Verify both apps show the updated value
curl http://localhost:3000
curl http://localhost:8080
```

## Environment Variables

### Application (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAUNCHDARKLY_SDK_KEY` | Yes | - | Your LaunchDarkly SDK key |
| `RELAY_PROXY_CONFIG_KEY` | Yes | - | Relay Proxy configuration key |
| `PORT` | No | 3000 | Port for the Express server |
| `RELAY_PROXY_URL` | No | http://relay-proxy:8030 | URL of the Relay Proxy |
| `REDIS_HOST` | No | redis | Redis hostname (PHP only) |
| `REDIS_PORT` | No | 6379 | Redis port (PHP only) |
| `REDIS_PREFIX` | No | - | Redis key prefix (PHP only, must match Relay Proxy environment ID) |

### Obtaining LaunchDarkly Credentials

**SDK Key:**
1. Log in to https://app.launchdarkly.com
2. Navigate to **Account Settings** > **Projects**
3. Select your project and environment
4. Copy the SDK key from **"Server-side SDK"** section

**Relay Proxy Configuration Key:**
1. Log in to https://app.launchdarkly.com
2. Navigate to **Account Settings** > **Relay Proxy**
3. Create or copy your Relay Proxy configuration key

## Project Structure

```
launchdarkly-relay-proxy-enterprise-demo/
├── .env                    # Environment variables (gitignored)
├── .env.example           # Example environment configuration
├── .gitignore            # Git ignore rules
├── LICENSE               # MIT License
├── Dockerfile            # Docker image for Node.js app
├── docker-compose.yml    # Multi-container orchestration (6 services)
├── package.json          # Node.js dependencies and scripts
├── server.js             # Express server entry point
├── load-test.js          # Standalone load testing script
├── api-service/          # API Service container
│   ├── Dockerfile       # API service Docker image
│   ├── package.json     # API service dependencies
│   ├── server.js        # API service Express server
│   └── README.md        # API service documentation
├── dashboard/           # Dashboard container
│   ├── Dockerfile       # Dashboard Docker image
│   └── nginx.conf       # Nginx configuration
├── src/
│   ├── app.js           # Express app and SDK routes
│   ├── config.js        # Configuration management
│   └── launchdarkly.js  # LaunchDarkly SDK singleton
├── public/
│   ├── dashboard.html   # Dashboard web UI
│   └── launchdarkly-logo.svg  # LaunchDarkly logo
└── php/                 # PHP application
    ├── Dockerfile       # PHP Docker image
    ├── composer.json    # PHP dependencies
    ├── index.php        # PHP application
    ├── nginx.conf       # Nginx configuration
    ├── supervisord.conf # Process manager config
    └── www.conf         # PHP-FPM pool config
```

## Troubleshooting

### SSE Connection Timeouts (Expected Behavior)

**Symptom**: Dashboard shows "Connection timeout - please refresh" for PHP service every 5 minutes, then automatically reconnects

**This is Expected Behavior**: PHP SSE connections are designed to close after 5 minutes to prevent resource exhaustion.

**Why This Happens**:
- PHP-FPM workers have limited capacity (20 max workers)
- Long-running connections can exhaust available workers
- 5-minute timeout prevents memory leaks and worker exhaustion
- Dashboard automatically reconnects seamlessly

**What's Normal**:
- PHP connection closes every 5 minutes with timeout message
- Dashboard reconnects within 1-2 seconds automatically
- Flag values continue to update correctly
- No manual intervention required

**When to Worry**:
- If reconnection fails repeatedly (check PHP container health)
- If timeout happens much faster than 5 minutes (check PHP-FPM logs)
- If connection never establishes (check api-service and PHP container)

**To Verify It's Working Correctly**:
```bash
# Check PHP container is healthy
docker-compose ps php

# View PHP logs (should show SSE connections opening/closing)
docker logs php-app-dev --tail 50

# Check for PHP-FPM worker exhaustion (should see ~5-8 workers, not 20)
docker exec php-app-dev ps aux | grep "php-fpm: pool www" | wc -l
```

### Redis Connection Issues

**Symptom**: Relay proxy logs show "Failed to connect to Redis" or similar errors

**Causes**:
- Redis container not running
- Redis container not healthy
- Network connectivity issues between containers

**Solutions**:
```bash
# Check Redis container status
docker-compose ps redis

# View Redis logs for errors
docker-compose logs redis

# Restart Redis container
docker-compose restart redis

# Verify Redis is on the correct network
docker network inspect launchdarkly-network

# Test connectivity from relay-proxy to redis
docker exec relay-proxy ping redis

# If Redis won't start, check volume permissions
docker volume inspect redis-data
```

### Redis Data Persistence Issues

**Symptom**: Feature flag data is lost after Redis restart

**Causes**:
- AOF persistence not enabled
- Volume not properly mounted
- Disk space issues

**Solutions**:
```bash
# Verify AOF is enabled
docker exec redis redis-cli CONFIG GET appendonly

# Check volume is mounted
docker inspect redis | grep -A 5 Mounts

# Check disk space
df -h

# Verify data directory exists in container
docker exec redis ls -la /data

# If data is corrupted, repair AOF file
docker exec redis redis-check-aof --fix /data/appendonly.aof
```

### SDK Initialization Timeout

**Symptom**: "SDK Error: Failed to initialize LaunchDarkly SDK: timeout waiting for initialization"

**Causes**:
- Relay proxy not running
- Invalid SDK key
- Network connectivity issues

**Solutions**:
```bash
# Check relay proxy status
docker-compose ps relay-proxy

# View relay proxy logs
docker-compose logs relay-proxy

# Restart services
docker-compose restart
```

### Flag Shows Fallback Value

**Symptom**: Message displays "Fallback: Flag not found or SDK offline"

**Causes**:
- Flag doesn't exist in LaunchDarkly
- Wrong flag key
- SDK not connected

**Solutions**:
1. Verify flag exists with key `user-message`
2. Check SDK connection in logs
3. Verify SDK key is correct

### Container Logs Not Showing

**Symptom**: "Unable to fetch logs" in UI

**Causes**:
- App container doesn't have Docker socket access
- Container names don't match

**Solutions**:
```bash
# Verify Docker socket is mounted
docker inspect app-dev | grep docker.sock

# Restart app container
docker-compose restart app
```

### Load Test Fails

**Symptom**: Load test shows connection errors

**Causes**:
- SDK not initialized
- Relay proxy overloaded

**Solutions**:
1. Reduce number of clients
2. Increase evaluation interval
3. Check relay proxy metrics during test

### Performance Issues

**Symptom**: High CPU or memory usage

**Solutions**:
1. Check relay proxy metrics in status dashboard
2. Reduce load test parameters
3. Monitor Docker stats: `docker stats`

## PHP-Specific Troubleshooting

### PHP Container Won't Start

**Symptom**: `docker-compose up` fails to start php-app container

**Causes**:
- Composer dependency installation failure
- PHP-FPM configuration error
- Nginx configuration error
- Redis not healthy

**Solutions**:
```bash
# Check PHP container logs
docker-compose logs php

# Verify Redis is healthy first
docker-compose ps redis

# Rebuild PHP container
docker-compose build php

# Check Dockerfile syntax
cat php/Dockerfile

# Verify composer.json is valid
cat php/composer.json
```

### PHP Application Returns 502 Bad Gateway

**Symptom**: Accessing http://localhost:8080 returns "502 Bad Gateway"

**Causes**:
- PHP-FPM not running
- Nginx can't connect to PHP-FPM socket
- PHP application error

**Solutions**:
```bash
# Check if PHP-FPM is running
docker exec php-app ps aux | grep php-fpm

# Check if Nginx is running
docker exec php-app ps aux | grep nginx

# View PHP-FPM logs
docker-compose logs php | grep php-fpm

# View Nginx error logs
docker exec php-app cat /var/log/nginx/error.log

# Restart PHP container
docker-compose restart php
```

### PHP SDK Initialization Fails

**Symptom**: PHP application shows "SDK initialization failed" error

**Causes**:
- Invalid LaunchDarkly SDK key
- Redis not accessible
- Wrong Redis key prefix
- Composer dependencies not installed

**Solutions**:
```bash
# Verify LAUNCHDARKLY_SDK_KEY is set
docker-compose config | grep LAUNCHDARKLY_SDK_KEY

# Test Redis connectivity from PHP container
docker exec php-app ping redis

# Check Redis is accessible
docker exec php-app nc -zv redis 6379

# Verify Redis has flag data
docker exec redis redis-cli KEYS "*"

# Check PHP logs for detailed error
docker-compose logs php

# Verify composer dependencies installed
docker exec php-app ls -la /var/www/html/vendor
```

### PHP Application Shows Fallback Values

**Symptom**: PHP app displays "Fallback: Flag not found" instead of actual flag value

**Causes**:
- Feature flag doesn't exist in LaunchDarkly
- Wrong Redis key prefix (environment mismatch)
- Redis not populated by Relay Proxy yet
- Flag key mismatch

**Solutions**:
```bash
# Verify flag exists in LaunchDarkly dashboard
# Flag key should be: user-message

# Check Redis keys to find environment ID
docker exec redis redis-cli KEYS "*"

# Verify REDIS_PREFIX matches environment
docker-compose config | grep REDIS_PREFIX

# Check if Relay Proxy has populated Redis
docker-compose logs relay-proxy | grep -i redis

# Wait for Relay Proxy to initialize (30 seconds)
sleep 30

# Check flag data in Redis
docker exec redis redis-cli HGETALL "ld-flags-<environment-id>:features"

# Restart PHP container after Redis is populated
docker-compose restart php
```

### PHP and Node.js Apps Show Different Flag Values

**Symptom**: PHP app and Node.js app display different values for the same flag

**Causes**:
- Different Redis key prefixes (different environments)
- Redis not yet updated after flag change
- Caching issue

**Solutions**:
```bash
# Verify Redis prefix matches environment
docker-compose config | grep REDIS_PREFIX

# Check Redis keys
docker exec redis redis-cli KEYS "*"

# Wait for Relay Proxy to update Redis
sleep 30

# Restart both containers
docker-compose restart app php

# Clear Redis cache and let Relay Proxy repopulate
docker exec redis redis-cli FLUSHALL
docker-compose restart relay-proxy
sleep 30
```

### PHP Application Can't Connect to Redis

**Symptom**: PHP logs show "Failed to connect to Redis" errors

**Causes**:
- Redis container not running
- Network connectivity issue
- Wrong Redis hostname or port

**Solutions**:
```bash
# Check Redis is running and healthy
docker-compose ps redis

# Verify network connectivity
docker exec php-app ping redis

# Check Redis port is accessible
docker exec php-app nc -zv redis 6379

# Verify environment variables
docker-compose config | grep REDIS

# Check both containers are on same network
docker network inspect launchdarkly-network

# Restart Redis and PHP
docker-compose restart redis php
```

## Feature Flag Configuration

### Recommended Flag Setup

**Flag Key**: `user-message`
**Type**: String (multi-variate)

**Variations**:
1. "Hello from LaunchDarkly!"
2. "Welcome to the demo!"
3. "Greetings from the Relay Proxy!"

**Targeting Examples**:

Target by location:
```
If user.location contains "San Francisco"
  Serve variation 2
```

Target by container:
```
If container.key is "app-dev"
  Serve variation 3
```

Target anonymous users:
```
If user.anonymous is true
  Serve variation 1
```

## Best Practices

### For Demos

1. **Pre-create flags** before starting demo
2. **Test flag changes** to verify real-time updates work
3. **Use load testing** to show performance under load
4. **Show container logs** to demonstrate SDK behavior
5. **Switch contexts** to show targeting capabilities

### For Development

1. **Use .env file** for local credentials
2. **Never commit .env** to version control
3. **Use docker-compose** for consistent environment
4. **Monitor logs** during development
5. **Test error scenarios** (relay proxy down, invalid keys)

## Security Notes

- `.env` file is gitignored and never committed
- SDK keys and configuration keys are environment variables only
- No sensitive data in code or configuration files
- Docker socket access is read-only where possible

## License

MIT License - See LICENSE file for details

## Resources

- **LaunchDarkly Docs**: https://docs.launchdarkly.com
- **Node.js SDK**: https://docs.launchdarkly.com/sdk/server-side/node-js
- **Relay Proxy**: https://docs.launchdarkly.com/home/relay-proxy
- **Docker**: https://docs.docker.com

## Support

For issues or questions:
- LaunchDarkly SDK: https://docs.launchdarkly.com/sdk/server-side/node-js
- Relay Proxy: https://docs.launchdarkly.com/home/relay-proxy
- Docker: https://docs.docker.com
