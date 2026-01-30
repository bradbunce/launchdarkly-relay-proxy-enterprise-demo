# API Service

The API Service is a centralized gateway that provides REST API endpoints for monitoring, status checks, and cross-service operations in the LaunchDarkly demo application.

## Purpose and Responsibilities

The API Service acts as a dedicated orchestration layer that:

- **Centralizes API Operations**: Provides a single point of access for all status checks and monitoring operations
- **Abstracts Service Communication**: Handles communication with downstream services (Relay Proxy, Redis, Node.js app, PHP app)
- **Manages Docker Operations**: Executes Docker commands for log retrieval and metrics collection
- **Ensures Resilience**: Implements error handling, timeouts, and graceful degradation
- **Simplifies Architecture**: Separates API concerns from SDK demonstration logic

## Available Endpoints

### Status Endpoints

#### GET /api/relay-status

Fetches the current status of the LaunchDarkly Relay Proxy.

**Response:**
```json
{
  "connected": true,
  "status": {
    "environments": {
      "environment-id": {
        "state": "VALID",
        "connectionStatus": {
          "state": "VALID",
          "stateSince": 1234567890
        }
      }
    },
    "version": "8.16.4"
  }
}
```

**Error Response:**
```json
{
  "connected": false,
  "error": "Unable to connect to relay proxy"
}
```

#### GET /api/redis/status

Checks Redis connectivity by executing a PING command.

**Response:**
```json
{
  "connected": true,
  "status": "healthy"
}
```

**Error Response:**
```json
{
  "connected": false,
  "status": "unhealthy",
  "error": "Redis connection failed"
}
```

#### GET /api/node/status

Fetches the status of the Node.js application and its SDK connection.

**Response:**
```json
{
  "connected": true,
  "mode": "relay-proxy",
  "sdkVersion": "9.10.5"
}
```

**Error Response:**
```json
{
  "connected": false,
  "error": "Unable to connect to Node.js application"
}
```

#### GET /api/php/status

Fetches the status of the PHP application and its SDK connection.

**Response:**
```json
{
  "connected": true,
  "mode": "daemon",
  "sdkVersion": "6.4.0"
}
```

**Error Response:**
```json
{
  "connected": false,
  "error": "Unable to connect to PHP application"
}
```

### Operations Endpoints

#### POST /api/load-test

Executes a load test against the specified SDK service (Node.js or PHP) to measure performance.

**Request Body:**
```json
{
  "requests": 100,
  "concurrency": 10,
  "service": "node"
}
```

**Parameters:**
- `requests` (number, optional): Total number of flag evaluations to perform. Default: 100. Range: 1-1000
- `concurrency` (number, optional): Number of simultaneous requests. Default: 10. Range: 1-100
- `service` (string, required): Target service. Must be either `"node"` or `"php"`

**Response (Success):**
```json
{
  "success": true,
  "totalRequests": 100,
  "successful": 100,
  "failed": 0,
  "avgResponseTime": 15.23,
  "requestsPerSecond": 250.45
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Unable to connect to Node.js service: Connection refused"
}
```

**Behavior:**
- The endpoint waits for the load test to complete before returning results
- Load test runs synchronously and may take several seconds depending on configuration
- Each request evaluates the `user-message` feature flag with a unique test context
- Results include performance metrics: latency, throughput, success rate

**Performance Comparison:**

| Service | Typical Latency | Typical Throughput | Architecture |
|---------|----------------|-------------------|--------------|
| Node.js | 10-50ms | 200-500 req/sec | Relay Proxy Mode (HTTP) |
| PHP | <1ms | 4000+ req/sec | Daemon Mode (Redis direct) |

**Example Usage:**
```bash
# Test Node.js service with 100 requests, 10 concurrent
curl -X POST http://localhost:4000/api/load-test \
  -H "Content-Type: application/json" \
  -d '{"requests": 100, "concurrency": 10, "service": "node"}'

# Test PHP service with 500 requests, 50 concurrent
curl -X POST http://localhost:4000/api/load-test \
  -H "Content-Type: application/json" \
  -d '{"requests": 500, "concurrency": 50, "service": "php"}'
```

**Notes:**
- High concurrency values may impact system performance
- PHP (Daemon Mode) typically shows much higher throughput due to direct Redis access
- Node.js (Relay Proxy Mode) demonstrates real-world network latency
- Load test results are also logged to the respective service container logs

#### GET /api/logs/:container

Retrieves the last 50 log lines from a specified container.

**Parameters:**
- `container` (path parameter): Container name. Must be one of: `node-app-dev`, `php-app-dev`, `relay-proxy`, `redis`

**Response:**
```json
{
  "lines": [
    "2024-01-28 10:30:45 [INFO] Application started",
    "2024-01-28 10:30:46 [INFO] SDK initialized"
  ]
}
```

**Error Response (Invalid Container):**
```json
{
  "error": "Invalid container name",
  "lines": []
}
```

**Error Response (Docker Failure):**
```json
{
  "error": "Unable to fetch logs for relay-proxy. Container may not be running.",
  "lines": []
}
```

#### GET /api/relay-metrics

Collects CPU and memory metrics from the Relay Proxy container.

**Response:**
```json
{
  "cpu": 2.5,
  "memory": "45.2MiB",
  "memoryPercent": 1.8,
  "timestamp": 1706438445000
}
```

**Error Response:**
```json
{
  "error": "Unable to fetch relay proxy metrics"
}
```

### Health Check

#### GET /health

Returns the health status of the API service itself.

**Response:**
```json
{
  "status": "healthy"
}
```

## Error Handling Behavior

The API Service implements comprehensive error handling to ensure resilience:

### Request Timeouts

All HTTP requests to downstream services have a 5-second timeout to prevent indefinite hanging:

```javascript
// Automatic timeout after 5 seconds
const response = await fetchWithTimeout(url, {}, 5000);
```

### Graceful Degradation

When a downstream service is unavailable, the API Service:
- Returns appropriate HTTP status codes (500 for service failures, 400 for validation errors)
- Provides structured error responses with descriptive messages
- Continues operating for other endpoints
- Logs errors with sufficient context for debugging

### Error Response Structure

All error responses follow a consistent structure:

```json
{
  "error": "Descriptive error message",
  "connected": false  // For status endpoints
}
```

### Error Logging

All errors are logged with context including:
- Timestamp
- Log level (ERROR)
- Endpoint that failed
- Error message and stack trace
- Additional context (upstream URL, container name, etc.)

Example log entry:
```json
{
  "timestamp": "2024-01-28T10:30:45.123Z",
  "level": "ERROR",
  "endpoint": "/api/relay-status",
  "error": "Request timeout",
  "upstreamUrl": "http://relay-proxy:8030/status"
}
```

## Docker Socket Requirements

The API Service requires access to the Docker socket to execute Docker commands for:
- Container log retrieval (`docker logs`)
- Container metrics collection (`docker stats`)

### Volume Mount

The Docker socket must be mounted as a volume in docker-compose.yml:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### User Permissions

The API Service container must run as root to access the Docker socket:

```yaml
user: root
```

### Security Considerations

- The Docker socket provides full access to the Docker daemon
- Only mount the socket if you trust the API Service code
- In production environments, consider using Docker API with restricted permissions
- The API Service only executes read-only Docker commands (logs, stats)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 4000 | Port for the API service |
| `RELAY_PROXY_URL` | No | http://relay-proxy:8030 | URL of the Relay Proxy |
| `NODE_APP_URL` | No | http://node-app-dev:3000 | URL of the Node.js application |
| `PHP_APP_URL` | No | http://php-app-dev:80 | URL of the PHP application |

## Running the API Service

### With Docker Compose

The API Service is automatically started with the full application:

```bash
docker-compose up -d
```

### Standalone (Development)

```bash
cd api-service
npm install
PORT=4000 node server.js
```

### Health Check

Verify the API Service is running:

```bash
curl http://localhost:4000/health
```

## Testing

The API Service includes comprehensive test coverage:

### Unit Tests

```bash
cd api-service
npm test
```

### Property-Based Tests

```bash
cd api-service
npm test -- --testPathPattern=pbt
```

## Troubleshooting

### API Service Won't Start

**Symptom**: Container fails to start or exits immediately

**Solutions**:
```bash
# Check logs
docker-compose logs api-service

# Verify dependencies are running
docker-compose ps relay-proxy redis

# Rebuild container
docker-compose build api-service
docker-compose up -d api-service
```

### Docker Commands Fail

**Symptom**: Log or metrics endpoints return errors

**Solutions**:
```bash
# Verify Docker socket is mounted
docker inspect api-service | grep docker.sock

# Check container is running as root
docker inspect api-service | grep User

# Test Docker access from inside container
docker exec api-service docker ps
```

### Downstream Service Unreachable

**Symptom**: Status endpoints return 500 errors

**Solutions**:
```bash
# Check target service is running
docker-compose ps relay-proxy node-app-dev php-app-dev redis

# Verify network connectivity
docker exec api-service ping relay-proxy
docker exec api-service ping node-app-dev
docker exec api-service ping php-app-dev
docker exec api-service ping redis

# Check all containers are on same network
docker network inspect launchdarkly-network
```

### Request Timeouts

**Symptom**: Endpoints return timeout errors after 5 seconds

**Solutions**:
- Check if downstream service is overloaded
- Verify network connectivity is stable
- Review downstream service logs for performance issues
- Consider increasing timeout in code if necessary

## Architecture Integration

The API Service integrates with the overall architecture as follows:

```
Dashboard (Port 8000)
    ↓
API Service (Port 4000)
    ↓
├── Relay Proxy (Port 8030)
├── Redis (Port 6379)
├── Node.js App (Port 3000)
└── PHP App (Port 8080)
```

The Dashboard UI fetches all status and monitoring data from the API Service, which in turn communicates with the downstream services. This creates a clean separation of concerns where:

- **Dashboard**: Presentation layer (static UI)
- **API Service**: Orchestration layer (status checks, operations)
- **Applications**: Business logic layer (SDK demonstrations)
- **Infrastructure**: Data layer (Relay Proxy, Redis)

## Development

### Adding New Endpoints

To add a new endpoint:

1. Add the route handler in `server.js`
2. Implement error handling with try-catch
3. Add request timeout for HTTP calls
4. Log errors with context
5. Return structured JSON responses
6. Add unit tests
7. Add property-based tests if applicable
8. Update this README

### Code Style

- Use async/await for asynchronous operations
- Implement proper error handling in all routes
- Use structured logging with JSON format
- Follow Express.js best practices
- Keep functions focused and single-purpose

## License

MIT License - See LICENSE file in project root for details
