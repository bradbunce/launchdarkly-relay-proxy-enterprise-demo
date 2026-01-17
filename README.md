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

### Required
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **LaunchDarkly Account**: With SDK key and Relay Proxy configuration key

### Optional (for local development)
- **Node.js**: Version 24 or higher
- **npm**: Version 8 or higher

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
# Open your browser to: http://localhost:3000
```

### 4. Stop the Application

```bash
docker-compose down
```

## Application Features

### User Interface

The demo application provides:

1. **Feature Flag Display**: Shows the current value of the `user-message` flag
2. **User Context Selector**: Switch between anonymous and custom user contexts
3. **Container Logs**: Real-time logs from both app-dev and relay-proxy containers
4. **Relay Proxy Status**: Detailed status information and performance metrics
5. **Load Testing**: Built-in load testing tool

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

Built-in load testing tool to measure relay proxy performance:

**Configuration:**
- Number of clients (1-100)
- Test duration (5-300 seconds)
- Evaluation interval (100-10000ms)

**Metrics:**
- Total evaluations
- Success rate
- Min/max/average latency
- Throughput (evaluations per second)

**Real-time Output:**
- Live progress updates
- Stats every 5 seconds
- Final summary report

## Architecture

### Containers

**app-dev** (Application Container):
- Node.js 24 Alpine
- Express web server
- LaunchDarkly SDK v9.10.5
- Docker CLI for log access
- Port: 3000

**relay-proxy** (Relay Proxy Container):
- LaunchDarkly Relay Proxy v8.16.4
- AutoConfig mode
- Event forwarding enabled
- Redis integration for persistent storage
- Port: 8030

**redis** (Redis Container):
- Redis 7 Alpine
- Persistent data store for feature flags
- AOF (Append-Only File) persistence enabled
- Health checks every 5 seconds
- Port: 6379 (exposed for local development/testing)
- Volume: redis-data for persistent storage

### Network

All containers (app, relay-proxy, redis) communicate via a custom Docker bridge network (`launchdarkly-network`).

### Redis Integration

The relay proxy uses Redis as a persistent data store for caching feature flag configurations. This architecture provides flexibility in how SDK clients retrieve feature flag data.

**Architecture Options:**

1. **SDK → Relay Proxy → Redis** (Current Configuration):
   - SDK clients connect to the Relay Proxy via HTTP
   - Relay Proxy fetches from Redis cache or LaunchDarkly API
   - Best for: Multiple SDK clients, centralized caching, HTTP-based access

2. **SDK → Redis** (Alternative Configuration):
   - SDK clients can be configured to read directly from Redis
   - Bypasses Relay Proxy for flag evaluation
   - Best for: High-performance scenarios, reduced network hops, direct cache access

**Benefits of Redis Integration:**

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

// Option 2: Direct Redis access (requires Redis feature store)
const RedisFeatureStore = require('launchdarkly-node-server-sdk/integrations').Redis;
const client = LD.init(sdkKey, {
  featureStore: RedisFeatureStore({
    redisOpts: { host: 'redis', port: 6379 },
    prefix: 'ld-flags',
    cacheTTL: 30
  })
});
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
1. Open http://localhost:3000
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

## Environment Variables

### Application (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAUNCHDARKLY_SDK_KEY` | Yes | - | Your LaunchDarkly SDK key |
| `RELAY_PROXY_CONFIG_KEY` | Yes | - | Relay Proxy configuration key |
| `PORT` | No | 3000 | Port for the Express server |
| `RELAY_PROXY_URL` | No | http://relay-proxy:8030 | URL of the Relay Proxy |

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
├── Dockerfile            # Docker image definition
├── docker-compose.yml    # Multi-container orchestration
├── package.json          # Node.js dependencies and scripts
├── server.js             # Express server entry point
├── load-test.js          # Standalone load testing script
├── src/
│   ├── app.js           # Express app and routes
│   ├── config.js        # Configuration management
│   └── launchdarkly.js  # LaunchDarkly SDK singleton
└── public/
    ├── index.html       # Web UI
    └── launchdarkly-logo.svg  # LaunchDarkly logo
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the application
npm start

# Or use nodemon for hot-reloading
npm run dev
```

### Available Scripts

- `npm start` - Start the application
- `npm run dev` - Start with hot-reloading (nodemon)
- `npm test` - Run test suite
- `npm run load-test` - Run standalone load test
- `npm run docker:build` - Build Docker images
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services

### Standalone Load Testing

Run load tests from the command line:

```bash
# Basic usage (10 clients, 60 seconds)
npm run load-test

# Custom parameters
node load-test.js --clients 50 --duration 120 --interval 500
```

## Troubleshooting

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

### Additional Demo Flags

**relay-proxy-status-response** (Boolean):
- Controls logging of relay proxy status responses
- Default: false
- Use for debugging

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
