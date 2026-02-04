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
- **Required Feature Flags**: Two flags must be created in your LaunchDarkly project:
  - `user-message` (string, multi-variate)
  - `terminal-panels` (boolean)
  
  See the [Required Feature Flags](#required-feature-flags) section below for detailed setup instructions.

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
# Note: The environment ID is the same as your Client-side ID
# Find it in LaunchDarkly: Account Settings > Projects > [Your Project] > [Environment] > Client-side ID
REDIS_PREFIX=ld-flags-'your-environment-id'
```

### 2. Create Required Feature Flags

This demo requires **two feature flags** to be created in your LaunchDarkly project:

#### Flag 1: user-message (Required)
1. Create a new flag with key: `user-message`
2. Set it as a **multi-variate string flag**
3. Add three variations:
   - "Hello from LaunchDarkly!"
   - "Welcome to the demo!"
   - "Greetings from the Relay Proxy!"
4. Turn the flag **ON** and set a default variation

**Purpose**: Primary demo flag that displays different messages to users. Used to demonstrate flag evaluation, targeting rules, and real-time updates across both Node.js and PHP applications.

#### Flag 2: terminal-panels (Required)
1. Create a new flag with key: `terminal-panels`
2. Set it as a **boolean flag**
3. Two variations:
   - `true` (show terminal panels)
   - `false` (hide terminal panels)
4. Turn the flag **ON** and set default to `true`

**Purpose**: Controls the visibility of terminal log panels in the dashboard UI. When set to `false`, terminal panels are hidden and data store windows expand to use the freed space. Demonstrates real-time UI control via feature flags.

**Important**: Both flags must exist in your LaunchDarkly project for the demo to function correctly. The application will show fallback values if these flags are missing.

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

### 5. Updating to Latest Version

When pulling updates from the repository, rebuild containers to ensure you have the latest code:

```bash
# Pull latest changes from repository
git pull

# Stop all containers
docker-compose down

# Rebuild all containers with latest code (no cache)
docker-compose build --no-cache

# Start containers with fresh builds
docker-compose up -d
```

**Why `--no-cache` is important**: Docker aggressively caches build layers. Without `--no-cache`, you might get old code even after pulling updates. This is especially important for:
- Dashboard UI changes (`public/dashboard.html`)
- Application code changes (`src/`, `php/`)
- Configuration file updates

**Quick rebuild for specific services**:

```bash
# Rebuild only dashboard after UI changes
docker-compose build --no-cache dashboard && docker-compose up -d dashboard

# Rebuild only Node.js app
docker-compose build --no-cache app && docker-compose up -d app

# Rebuild only PHP app
docker-compose build --no-cache php && docker-compose up -d php
```

**Browser cache**: After rebuilding the dashboard, do a hard refresh in your browser:
- **Mac**: Cmd + Shift + R
- **Windows/Linux**: Ctrl + Shift + R
- **Or**: Close the tab completely and open a fresh one

### 6. Stop the Application

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
6. **Relay Proxy Connection Toggle**: Simulate network disconnection scenarios
7. **Load Testing**: Built-in load testing tool

### Relay Proxy Connection Toggle

The dashboard includes a connection toggle that allows you to simulate network disconnection scenarios between the Relay Proxy and LaunchDarkly without stopping the container. This feature is useful for testing how your application behaves when flag updates are unavailable.

**What It Does:**
- **Disconnect**: Blocks outbound network traffic from the Relay Proxy to LaunchDarkly using iptables rules
- **Reconnect**: Removes blocking rules to restore connectivity
- **Status Display**: Shows current connection state (Connected/Disconnected/Container Stopped)

**How to Use:**
1. Open the dashboard at http://localhost:8000
2. Locate the "Relay Proxy" panel
3. Find the "Connection to LaunchDarkly" toggle switch
4. Click the toggle to disconnect or reconnect
5. Observe the status text change (Connected → Disconnected)

**What Happens During Disconnection:**
- Relay Proxy container remains running
- SDK clients (Node.js and PHP) continue to evaluate flags using cached data from Redis
- No new flag updates are received from LaunchDarkly
- Internal Docker network connectivity (Redis access) is preserved
- Dashboard continues to display cached flag data

**Testing Scenarios:**
1. **Resilience Testing**: Verify your application continues to function with cached flags
2. **Daemon Mode vs Proxy Mode**: Compare PHP (daemon mode) and Node.js (proxy mode) behavior during disconnection
3. **Flag Update Lag**: Disconnect, change flags in LaunchDarkly, reconnect, and observe synchronization
4. **Cache Validation**: Confirm that Redis cache provides continuity during network issues

**Technical Details:**
- Uses iptables FORWARD chain rules to block traffic
- Blocks traffic to LaunchDarkly domains: `clientstream.launchdarkly.com`, `app.launchdarkly.com`, `events.launchdarkly.com`
- Resolves domains to IP addresses at disconnect time
- Connection state persists across dashboard refreshes
- Automatic status polling every 5 seconds

**Limitations:**
- **IP Address Changes**: If LaunchDarkly changes their IP addresses, you may need to reconnect and disconnect again
- **DNS Caching**: DNS resolution happens at disconnect time; new IPs won't be blocked until next disconnect
- **Container Restart**: Restarting the Relay Proxy container automatically clears all blocking rules (returns to connected state)
- **Requires Root**: API service container must run as root to execute iptables commands (already configured in docker-compose.yml)

**Auto-Configuration and Offline Resilience:**

This demo uses the Relay Proxy's **auto-configuration mode** (`AUTO_CONFIG_KEY`), which provides convenience but has important implications for offline resilience:

**How Auto-Config Works:**
1. On startup, the Relay Proxy connects to LaunchDarkly to fetch environment configurations
2. Once configured, it initializes each environment's SDK client
3. Each SDK client reads from Redis (if available) and streams updates from LaunchDarkly
4. The Relay Proxy serves flag data to downstream SDK clients

**Critical Limitation - Relay Proxy Restart While Disconnected:**

If the Relay Proxy is **restarted** while disconnected from LaunchDarkly:
- ❌ The Relay Proxy **cannot initialize** because it needs auto-config from LaunchDarkly
- ❌ It will continuously retry connecting to LaunchDarkly and remain in a degraded state
- ❌ SDK clients in **Proxy Mode** (Node.js) cannot evaluate flags because the Relay Proxy isn't serving
- ✅ SDK clients in **Daemon Mode** (PHP) **can still evaluate flags** by reading directly from Redis

**Why This Happens:**
- Auto-config mode requires LaunchDarkly connectivity on startup to discover which environments to initialize
- The Relay Proxy doesn't persist auto-config data to disk for offline restarts
- Without environment configuration, the Relay Proxy doesn't know which Redis keys to read

**Recommended Usage:**
- ✅ **Disconnect without restart**: Relay Proxy continues serving from cache and Redis (works perfectly)
- ❌ **Disconnect + restart**: Relay Proxy cannot initialize (avoid this scenario)
- ✅ **Production scenario**: Network outages rarely coincide with container restarts

**SDK Mode Comparison During Disconnection:**

| Scenario | Proxy Mode (Node.js) | Daemon Mode (PHP) |
|----------|---------------------|-------------------|
| **Disconnected (no restart)** | ✅ Works - serves from Relay Proxy cache | ✅ Works - reads from Redis |
| **Disconnected + Relay Proxy restart** | ❌ Fails - Relay Proxy can't initialize | ✅ Works - reads from Redis |
| **Real-time updates** | ✅ Streaming (instant) | ⚠️ Polling (5-30 second delay) |
| **Latency** | ~10-50ms (network call) | <1ms (local Redis) |
| **Throughput** | Moderate | Very high (4000+ req/sec) |
| **Complexity** | Simple (single connection) | Complex (Redis + events) |

**Trade-offs:**

**Proxy Mode (Node.js in this demo):**
- ✅ Real-time streaming updates (instant flag changes)
- ✅ Simpler configuration (single endpoint)
- ✅ No polling overhead
- ❌ Requires Relay Proxy to be running and initialized
- ❌ Cannot survive Relay Proxy restart during disconnection

**Daemon Mode (PHP in this demo):**
- ✅ Maximum resilience (survives Relay Proxy restart)
- ✅ Highest performance (direct Redis reads)
- ✅ Works even if Relay Proxy is down
- ❌ Polling-based updates (5-30 second delay)
- ❌ More complex configuration (Redis + events)
- ❌ Requires Redis to be available

**Alternative: Manual Environment Configuration**

For maximum offline resilience, you could use manual environment configuration instead of auto-config:
- Configure environments explicitly in a config file or environment variables
- Relay Proxy can initialize offline using the static configuration
- Both Proxy Mode and Daemon Mode SDKs work after restart
- Trade-off: Lose the convenience of auto-config (must manually update when adding environments)

**For This Demo:**
- We use auto-config for ease of setup
- The disconnect toggle is designed to simulate network issues **without restarting containers**
- This reflects real-world scenarios where network outages don't typically coincide with service restarts
- Both SDK modes demonstrate their respective strengths: Node.js shows streaming updates, PHP shows maximum resilience

**Example Workflow:**
```bash
# 1. Start all services
docker-compose up -d

# 2. Open dashboard and verify "Connected" status
# http://localhost:8000

# 3. Click disconnect toggle
# Status changes to "Disconnected"

# 4. Verify SDK clients still work (cached flags)
curl http://localhost:3000/api/flag
curl http://localhost:8080/api/status

# 5. Change flag value in LaunchDarkly dashboard
# SDK clients won't see the change (disconnected)

# 6. Click reconnect toggle
# Status changes to "Connected"

# 7. Wait 30 seconds for Relay Proxy to sync
sleep 30

# 8. Verify SDK clients now show updated flag value
curl http://localhost:3000/api/flag
curl http://localhost:8080/api/status
```

**API Endpoints:**

The connection toggle uses these API endpoints (also available for programmatic testing):

```bash
# Disconnect Relay Proxy from LaunchDarkly
curl -X POST http://localhost:4000/api/relay-proxy/disconnect

# Reconnect Relay Proxy to LaunchDarkly
curl -X POST http://localhost:4000/api/relay-proxy/reconnect

# Check current connection status
curl http://localhost:4000/api/relay-proxy/connection-status
```

For detailed API documentation, see [api-service/README.md](api-service/README.md#relay-proxy-connection-control).

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

**Relay Proxy Panel:**
The Relay Proxy panel includes a "Relay Proxy Cache" display that shows the internal Go SDK cache maintained by the Relay Proxy. This demonstrates data consistency across all layers:
- **Layer 1**: LaunchDarkly Cloud (source of truth)
- **Layer 2**: Relay Proxy's Internal Cache (Go SDK in-memory)
- **Layer 3**: Redis Persistent Store (shared cache)
- **Layer 4**: Node.js SDK Cache (receives from Relay Proxy)
- **Layer 5**: PHP SDK Cache (reads from Redis)

The Relay Proxy cache display shows:
- Raw flag configurations as served to downstream SDK clients
- The same data structure that Node.js receives via streaming
- Real-time updates when flags change in LaunchDarkly
- Complete flag details including variations, rules, targets, and prerequisites

This feature is useful for:
- Understanding how flags are structured internally
- Debugging targeting rules and rollouts
- Verifying flag configurations are cached correctly
- Learning how LaunchDarkly stores flag data
- Monitoring the shared Redis data store used by multiple services
- Demonstrating data consistency across the entire architecture

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

**Context Persistence Across SSE Connections:**

The application uses specialized context stores to ensure user context (including location attributes) persists across Server-Sent Events (SSE) connections:

**Node.js Context Store:**
- In-memory Map stores context by contextKey
- SSE connections pass contextKey in URL query parameter
- Context updates via POST endpoint stored in both session and in-memory store
- Ensures location attribute is available for flag evaluation in SSE endpoint

**PHP Context Store:**
- File-based store at `/tmp/php-context-store.json`
- Required because PHP doesn't maintain memory between requests
- SSE connections read from file store using contextKey
- Context updates stored in both session and file store
- Enables location-based targeting in daemon mode

**Why This Matters:**
- EventSource (SSE) creates separate HTTP connections that don't share session state
- Without context stores, location attributes wouldn't reach flag evaluation
- Enables targeting rules based on `user.location` attribute
- Works seamlessly for both Node.js (Proxy Mode) and PHP (Daemon Mode)

### Bucketing Hash Values

Each service panel includes a collapsible "Bucketing Hash Values" section that displays the hash calculation used by LaunchDarkly to determine which variation a user receives in percentage rollouts.

**What You Can See:**
- **Context Key**: The user identifier used in the hash calculation
- **Salt**: The unique salt value from the flag configuration
- **Hash Value**: The raw SHA-1 hash result (first 60 bits as decimal)
- **Bucket Value**: The normalized value between 0 and 1 used for rollout decisions

**How LaunchDarkly's Bucketing Algorithm Works:**

LaunchDarkly uses a deterministic hashing algorithm to assign users to variations in percentage rollouts:

1. **Hash Input Format**: `{flagKey}.{salt}.{contextKey}`
   - Example: `user-message.94b881a3be5c449d99dbbe1a92ca3fa0.node-anon-42163483`

2. **Hash Algorithm**: SHA-1 (not MurmurHash3)
   - Calculates SHA-1 hash of the input string
   - Extracts first 15 hexadecimal characters (60 bits)
   - Converts to decimal integer

3. **Bucket Calculation**: Divide by `0xFFFFFFFFFFFFFFF` (2^60 - 1)
   - Result is a float between 0 and 1
   - Example: `0.85104` means user is in the 85.104th percentile

4. **Variation Assignment**: Compare bucket value to rollout percentages
   - Variation 0: 0% - 50% (bucket < 0.5)
   - Variation 1: 50% - 100% (bucket >= 0.5)
   - User with bucket `0.85104` receives Variation 1

**Technical Implementation:**

Both Node.js and PHP implementations use identical algorithms to ensure consistency:

**Node.js** (`src/nodejs/src/calculateHashValue.js`):
```javascript
import crypto from 'crypto';

// LaunchDarkly's bucketing algorithm
const hashKey = `${flagKey}.${salt}.${contextKey}`;

// Calculate SHA-1 hash
const sha1Hash = crypto.createHash('sha1').update(hashKey).digest('hex');

// Extract first 15 hex characters (60 bits)
const hashPrefix = sha1Hash.substring(0, 15);

// Convert to integer and normalize
const hashValue = parseInt(hashPrefix, 16);
const bucketValue = hashValue / 0xFFFFFFFFFFFFFFF;
```

**PHP** (`src/php/src/CalculateHashValue.php`):
```php
// LaunchDarkly's bucketing algorithm
$hashKey = "{$flagKey}.{$salt}.{$contextKey}";

// Calculate SHA-1 hash
$sha1Hash = sha1($hashKey);

// Extract first 15 hex characters (60 bits)
$hashPrefix = substr($sha1Hash, 0, 15);

// Convert using GMP for precise large integer handling
$hashGmp = gmp_init($hashPrefix, 16);
$divisorGmp = gmp_init('FFFFFFFFFFFFFFF', 16); // 2^60 - 1

// Calculate bucket value
$bucketValue = (float)gmp_strval($hashGmp) / (float)gmp_strval($divisorGmp);
```

**Why This Feature Matters:**

- **Educational**: Understand how LaunchDarkly assigns users to variations
- **Debugging**: Verify why a specific user receives a particular variation
- **Consistency**: Confirm both Node.js and PHP return identical values
- **Transparency**: See the exact calculation behind percentage rollouts
- **Predictability**: Same context key always gets same bucket value for a flag

**Cross-Platform Consistency:**

The demo verifies that both Node.js and PHP implementations return identical hash and bucket values for the same inputs, demonstrating that LaunchDarkly's bucketing algorithm works consistently across different SDK implementations and languages.

**Example Output:**
```
Context Key: node-anon-42163483-4966-4ba0-ac94-6700041f00d3
Salt: 94b881a3be5c449d99dbbe1a92ca3fa0
Hash Value: 1001234567890123
Bucket Value: 0.85104
```

In this example, the user's bucket value of `0.85104` means they fall into the 85.104th percentile. With a 50/50 rollout, they would receive Variation 1 (the second variation) since their bucket value is >= 0.5.

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

## Docker Health Checks

This application uses Docker health checks to monitor container health and manage service dependencies. Health checks run automatically in the background and are a normal part of the application's operation.

### What Are Health Checks?

Health checks are periodic tests that Docker runs to verify a container is functioning correctly. They help ensure:
- Services are ready to accept connections before dependent services start
- Containers are restarted automatically if they become unhealthy
- The overall system remains stable and responsive

### Configured Health Checks

The following containers have health checks configured:

**Redis** (every 5 seconds):
- Command: `redis-cli ping`
- Purpose: Verifies Redis is accepting connections
- Critical: Other services wait for Redis to be healthy before starting
- Timeout: 3 seconds
- Retries: 5 attempts before marking unhealthy

**Dashboard** (every 10 seconds):
- Command: `curl -f http://localhost:8000/`
- Purpose: Verifies Nginx is serving the web UI
- Timeout: 3 seconds
- Retries: 3 attempts before marking unhealthy

**API Service** (every 10 seconds):
- Command: `curl -f http://localhost:4000/health`
- Purpose: Verifies the API gateway is responding
- Timeout: 3 seconds
- Retries: 3 attempts before marking unhealthy

### What You'll See

When monitoring Docker events or logs, you may observe:

**Health Check Activity**:
- Health check commands run every 5-10 seconds (this is normal)
- You'll see periodic container executions in Docker events
- These are lightweight operations that don't impact performance

**Temporary Alpine Containers**:
- Short-lived Alpine containers may appear during disconnect/reconnect operations
- These are created by iptables commands to manipulate network rules
- They are automatically removed after completing their task
- This is expected behavior for the relay proxy connection toggle feature

### Viewing Health Status

Check the health status of all containers:

```bash
# View health status for all services
docker-compose ps

# View detailed health check logs for a specific container
docker inspect redis --format='{{json .State.Health}}' | jq

# Monitor health check events in real-time
docker events --filter type=container --filter event=health_status

# View health check history
docker inspect redis --format='{{range .State.Health.Log}}{{.Start}} - {{.ExitCode}} - {{.Output}}{{end}}'
```

### Health Check Dependencies

The docker-compose.yml configuration uses health checks to manage startup order:

**Redis → Relay Proxy**:
- Relay Proxy waits for Redis to be healthy before starting
- Ensures Redis is ready to accept connections for flag storage
- Prevents connection errors during initialization

**Redis → PHP Application**:
- PHP application waits for Redis to be healthy before starting
- Ensures Redis is available for daemon mode flag reads
- Prevents PHP SDK initialization failures

**No Dependencies for Dashboard**:
- Dashboard is a static site that doesn't require backend services to start
- Remains available even if backend services restart
- Connects to services via client-side JavaScript

### Troubleshooting Health Checks

If a container is marked as unhealthy:

```bash
# Check why a container is unhealthy
docker inspect <container-name> --format='{{json .State.Health}}' | jq

# View recent health check failures
docker-compose logs <container-name> | grep -i health

# Manually run the health check command
docker exec <container-name> <health-check-command>

# Example: Test Redis health check manually
docker exec redis redis-cli ping

# Example: Test API service health check manually
docker exec api-service curl -f http://localhost:4000/health
```

**Common Issues**:
- **Redis unhealthy**: Check if Redis is running and accepting connections
- **Dashboard unhealthy**: Verify Nginx is running and port 8000 is accessible
- **API service unhealthy**: Check if the Express server started successfully

### Disabling Health Checks

Health checks can be disabled by removing the `healthcheck` sections from docker-compose.yml, but this is not recommended as it may cause:
- Services starting before their dependencies are ready
- Connection errors during initialization
- Reduced system reliability

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

**Finding Your Environment ID (Client-side ID)**:

The environment ID is the same value as your **Client-side ID** in LaunchDarkly.

**Option 1: From LaunchDarkly UI**
1. Log in to https://app.launchdarkly.com
2. Navigate to **Account Settings** > **Projects**
3. Select your project and environment
4. Copy the **Client-side ID** value
5. Use it in the format: `REDIS_PREFIX=ld-flags-{client-side-id}`

**Option 2: From Redis**
```bash
# List all Redis keys
docker exec redis redis-cli KEYS "*"

# Look for keys like: ld-flags-507f1f77bcf86cd799439011:features
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

Once the services are running, the PHP backend API is accessible at:

**URL**: http://localhost:8080

**Note**: The PHP service is **API-only** and returns JSON responses. For a visual interface, use the unified dashboard at http://localhost:8000 which displays both Node.js and PHP services.

**Available Endpoints:**
- `GET /` - API information and available endpoints
- `GET /api/status` - SDK and Redis status
- `GET /api/context` - Get current context
- `POST /api/context` - Update context
- `POST /api/test-evaluation` - Test flag evaluation
- `POST /api/redis-cache` - Get Redis data store
- `POST /api/load-test` - Run load test
- `GET /api/message/stream` - SSE stream for flag updates
- `GET /redis-monitor` - SSE stream for Redis monitor

**Example:**
```bash
# Get API information
curl http://localhost:8080

# Check PHP SDK status
curl http://localhost:8080/api/status
```

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

# 5. Access PHP API and verify it returns status
curl http://localhost:8080/api/status

# 6. Test flag evaluation via API
curl -X POST http://localhost:8080/api/test-evaluation \
  -H "Content-Type: application/json" \
  -d '{"context": {"key": "test-user", "anonymous": false}}'

# 7. Stop Relay Proxy to test daemon mode independence
docker-compose stop relay-proxy

# 8. Verify PHP app still works (reads from Redis cache)
curl http://localhost:8080/api/status

# 9. Check PHP logs show no LaunchDarkly API connection attempts
docker-compose logs php | grep -i "launchdarkly"

# 10. Restart Relay Proxy
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

# 3. Test Node.js API endpoint
curl http://localhost:3000/api/flag

# 4. Test PHP API endpoint
curl -X POST http://localhost:8080/api/test-evaluation \
  -H "Content-Type: application/json" \
  -d '{"context": {"key": "test-user", "anonymous": false}}'

# 5. Compare flag values - they should match

# 6. Change flag value in LaunchDarkly dashboard

# 7. Wait for Relay Proxy to update Redis (30 seconds)
sleep 30

# 8. Verify both apps show the updated value
curl http://localhost:3000/api/flag
curl -X POST http://localhost:8080/api/test-evaluation \
  -H "Content-Type: application/json" \
  -d '{"context": {"key": "test-user", "anonymous": false}}'
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
| `REDIS_PREFIX` | No | - | Redis key prefix (PHP only, must match Relay Proxy environment ID / Client-side ID) |

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

## Required Feature Flags

This demo application requires **two feature flags** to be created in your LaunchDarkly project. Both flags must exist for the demo to work correctly.

### Flag 1: user-message (Required)

**Flag Key**: `user-message`
**Type**: String (multi-variate)
**Status**: Must be turned ON

**Variations**:
1. "Hello from LaunchDarkly!"
2. "Welcome to the demo!"
3. "Greetings from the Relay Proxy!"

**Purpose**: 
This is the primary demo flag that displays different messages to users. It demonstrates:
- Flag evaluation across both Node.js and PHP applications
- Multi-variate string flags with multiple variations
- Real-time flag updates via Server-Sent Events (SSE)
- Targeting rules and context-based evaluation
- Consistency between Proxy Mode (Node.js) and Daemon Mode (PHP)

**What Happens Without This Flag**:
The application will display "Fallback: Flag not found or SDK offline" instead of the actual message.

**Targeting Examples**:

Target by location:
```
If user.location contains "San Francisco"
  Serve variation 2: "Welcome to the demo!"
```

Target by container:
```
If container.key is "app-dev"
  Serve variation 3: "Greetings from the Relay Proxy!"
```

Target anonymous users:
```
If user.anonymous is true
  Serve variation 1: "Hello from LaunchDarkly!"
```

### Flag 2: terminal-panels (Required)

**Flag Key**: `terminal-panels`
**Type**: Boolean
**Status**: Must be turned ON
**Default Value**: `true` (recommended)

**Variations**:
- `true`: Show terminal panels (default)
- `false`: Hide terminal panels and expand data store windows

**Purpose**: 
Controls the visibility of terminal log panels in the dashboard UI. This flag demonstrates:
- Real-time UI control via feature flags
- Dynamic layout adjustments based on flag state
- Instant updates without browser refresh via SSE
- Boolean flag evaluation with anonymous context

**Behavior**:
- **Real-time Updates**: Changes apply instantly without browser refresh via SSE
- **Smooth Transitions**: CSS animations provide smooth show/hide effects
- **Dynamic Layout**: When hidden, data store windows expand to use freed space
- **Context**: Evaluated with anonymous context (not user-specific)

**Use Cases**:
- Hide terminal panels during presentations for cleaner UI
- Focus on data store content without log distractions
- Demonstrate real-time UI control via feature flags
- Show dynamic layout adjustments based on flag state

**Technical Details**:
- Terminal panels occupy 514px of vertical space when visible
- Data store windows expand by varying amounts when terminals hidden:
  - Node.js SDK Cache: 280px → 794px
  - PHP SDK Cache: 280px → 794px
  - Relay Proxy Cache: 400px → 680px
  - Redis Data Store: 517px → 750px
- All panels maintain scrolling functionality in both states

**What Happens Without This Flag**:
The terminal panels will always be visible (fallback to `true`), and you won't be able to demonstrate dynamic UI control.

### Creating the Flags in LaunchDarkly

1. Log in to https://app.launchdarkly.com
2. Navigate to your project and environment
3. Click **"Create flag"**
4. For `user-message`:
   - Enter key: `user-message`
   - Select type: **String**
   - Click **"Create flag"**
   - Add the three variations listed above
   - Turn the flag **ON**
   - Set a default variation
5. For `terminal-panels`:
   - Enter key: `terminal-panels`
   - Select type: **Boolean**
   - Click **"Create flag"**
   - Turn the flag **ON**
   - Set default to `true`

**Important**: Both flags must be created in the same LaunchDarkly project and environment that your SDK key and Relay Proxy configuration key are associated with.

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
