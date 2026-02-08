# Test: Relay Proxy Reads from Redis When LaunchDarkly is Unreachable

## Purpose
Demonstrate that the Relay Proxy reads from Redis when it cannot connect to LaunchDarkly, providing disaster recovery capability.

## Prerequisites
- Redis must be running and populated with flag data
- Relay Proxy must be configured with `USE_REDIS=1` (already configured)

## Test Scenario: Disconnect LaunchDarkly, Restart Relay Proxy

### Step 1: Verify Normal Operation
```bash
# Check that Relay Proxy is connected to LaunchDarkly
curl -s http://localhost:8030/status | jq '.environments[].connectionStatus.state'
# Should show: "VALID"

# Check that Redis has flag data
docker exec redis redis-cli KEYS "ld-flags-*"
# Should show keys like: ld-flags-$CID:features
```

### Step 2: Verify Redis Contains Flag Data
```bash
# Check what's in Redis
docker exec redis redis-cli GET "ld-flags-\$CID:features" | jq 'keys'
# Should show flag keys like: ["user-message", "dashboard-service-panel-1", "terminal-panels"]
```

### Step 3: Disconnect Relay Proxy from LaunchDarkly
- Open dashboard: http://localhost:8000/dashboard.html
- Click the connection toggle to disconnect
- Wait for status to show "Disconnected" (red)
- This blocks the Relay Proxy's IP from reaching LaunchDarkly

### Step 4: Restart Relay Proxy (While Disconnected)
```bash
docker restart relay-proxy
sleep 5
```

### Step 5: Check Relay Proxy Status
```bash
# Check connection status
curl -s http://localhost:8030/status | jq '.environments[].connectionStatus'
# Should show: state: "INTERRUPTED" or "OFF" (cannot reach LaunchDarkly)
```

### Step 6: Verify Relay Proxy is Serving Flags from Redis
```bash
# The Relay Proxy should still serve flags even though LaunchDarkly is unreachable
# Test by evaluating a flag through the Node.js SDK (which connects to Relay Proxy)
curl -s http://localhost:3000/api/flag
# Should return flag value (read from Redis via Relay Proxy)
```

### Step 7: Check Relay Proxy Logs
```bash
docker logs relay-proxy --tail 50 | grep -i "redis\|initialized"
# Should see: "RedisDataStore: Initialized with X items"
# This confirms Relay Proxy read from Redis on startup
```

### Step 8: Reconnect to LaunchDarkly
- Click the connection toggle to reconnect
- Wait for status to show "Connected" (green)

## Expected Results

✅ **Relay Proxy reads from Redis when LaunchDarkly is unreachable**
- On startup, if LaunchDarkly streaming fails, Relay Proxy reads from Redis
- SDKs can still evaluate flags using cached data from Redis
- This provides disaster recovery capability

## What This Demonstrates

**Redis serves two purposes:**

1. **Write-Through Cache (Normal Operation)**:
   - Relay Proxy receives updates from LaunchDarkly
   - Writes updates to Redis for persistence
   - Serves updates to SDKs from in-memory cache

2. **Read-Through Cache (Disaster Recovery)**:
   - If LaunchDarkly is unreachable on startup
   - Relay Proxy reads from Redis
   - Serves cached flags to SDKs
   - Continues operating with stale data until LaunchDarkly reconnects

## Alternative Test: Stop LaunchDarkly Connection Before Starting Relay Proxy

```bash
# 1. Disconnect from LaunchDarkly (using dashboard toggle)
# 2. Stop Relay Proxy
docker stop relay-proxy

# 3. Verify Redis still has data
docker exec redis redis-cli KEYS "ld-flags-*"

# 4. Start Relay Proxy (while still disconnected from LaunchDarkly)
docker start relay-proxy
sleep 5

# 5. Check logs - should see Redis initialization
docker logs relay-proxy --tail 30 | grep -i redis

# 6. Test flag evaluation - should work using Redis data
curl -s http://localhost:3000/api/flag
```

## Notes

- The Relay Proxy logs "RedisDataStore: Initialized with X items" when it reads from Redis
- This happens on startup when LaunchDarkly streaming is not available
- The Relay Proxy will continue trying to connect to LaunchDarkly in the background
- Once LaunchDarkly connection is restored, it will resume receiving real-time updates
