# Connection Timing Instrumentation

This document explains the timing instrumentation added to track how long it takes for the Relay Proxy to detect disconnection and reconnection events.

## Overview

When you disconnect or reconnect the Relay Proxy using the dashboard toggle, the system now tracks and logs detailed timing information to help you understand:

1. **Disconnect**: How long it takes from applying the iptables rule until the Relay Proxy realizes the connection is gone
2. **Reconnect**: How long it takes from removing the iptables rule until the Relay Proxy successfully reconnects

## What Gets Logged

### Disconnect Timing

When you click "Disconnect" in the dashboard:

```
[TIMING] Disconnect initiated at 2026-02-06T17:52:19.681Z
[TIMING] iptables rule applied in 1.02 seconds
[TIMING] Starting background monitoring to detect when Relay Proxy realizes disconnection...
```

Then, after the Relay Proxy detects the disconnection (typically 30-120 seconds):

```
[TIMING] === DISCONNECT SUMMARY ===
[TIMING] iptables rule applied: 1.02s
[TIMING] Relay Proxy detected disconnection: 45.23s
[TIMING] Time for Relay Proxy to realize connection is gone: 44.21s
```

### Reconnect Timing

When you click "Reconnect" in the dashboard:

```
[TIMING] Reconnect initiated at 2026-02-06T17:53:05.123Z
[TIMING] iptables rule removed in 0.15 seconds
[TIMING] Starting background monitoring to detect when Relay Proxy successfully reconnects...
```

Then, after the Relay Proxy successfully reconnects (typically 3-60+ seconds depending on backoff):

```
[TIMING] === RECONNECT SUMMARY ===
[TIMING] iptables rule removed: 0.15s
[TIMING] Relay Proxy successfully reconnected: 12.45s
[TIMING] Time from network available to successful reconnection: 12.30s
```

## How It Works

### Background Monitoring

The system starts a background monitoring process that:

1. Polls the Relay Proxy `/status` endpoint every 2 seconds
2. Checks the `connectionStatus.state` field in the environment data
3. Detects state changes:
   - For disconnect: Looks for transition to `INTERRUPTED` state
   - For reconnect: Looks for transition to `VALID` state
4. Logs timing information when state changes are detected
5. Times out after 2 minutes (disconnect) or 4 minutes (reconnect)

### API Response

Both disconnect and reconnect endpoints now return timing information in the response:

**Disconnect Response:**
```json
{
  "success": true,
  "message": "Relay Proxy disconnected from LaunchDarkly",
  "containerIP": "172.18.0.5",
  "subnet": "172.18.0.0/16",
  "rule": "Block 172.18.0.5 to internet, allow 172.18.0.0/16",
  "timing": {
    "disconnectStarted": "2026-02-06T17:52:19.681Z",
    "iptablesApplied": "2026-02-06T17:52:20.703Z",
    "iptablesElapsedMs": 1022
  }
}
```

**Reconnect Response:**
```json
{
  "success": true,
  "message": "Relay Proxy reconnected to LaunchDarkly",
  "containerIP": "172.18.0.5",
  "subnet": "172.18.0.0/16",
  "timing": {
    "reconnectStarted": "2026-02-06T17:53:05.123Z",
    "iptablesRemoved": "2026-02-06T17:53:05.273Z",
    "iptablesElapsedMs": 150
  }
}
```

## Viewing the Logs

To see the timing logs in real-time:

### Option 1: Docker Logs
```bash
docker logs -f api-service
```

### Option 2: Docker Compose Logs
```bash
docker-compose logs -f api-service
```

### Option 3: Filter for Timing Logs Only
```bash
docker logs -f api-service 2>&1 | grep "\[TIMING\]"
```

## Expected Timing Values

Based on testing and TCP behavior:

### Disconnect Detection
- **iptables rule applied**: < 2 seconds (typically ~1 second)
- **Relay Proxy detects disconnection**: 30-120 seconds
  - Depends on TCP keepalive settings
  - Depends on application-level timeout settings
  - LaunchDarkly SDK typically detects within 30-60 seconds

### Reconnection
- **iptables rule removed**: < 1 second (typically ~0.1-0.5 seconds)
- **Relay Proxy reconnects**: 3-60+ seconds
  - **3-10 seconds** if disconnected briefly (early in backoff cycle)
  - **30-60+ seconds** if disconnected for several minutes (exponential backoff)
  - Depends on when the next retry attempt is scheduled

## Use Cases

### Performance Testing
Track how quickly your system responds to network changes:
```bash
# Disconnect and watch logs
curl -X POST http://localhost:4000/api/relay-proxy/disconnect
docker logs -f api-service 2>&1 | grep "\[TIMING\]"
```

### Debugging Connection Issues
If reconnection takes longer than expected, the logs will show:
- Whether the iptables rule was removed successfully
- How long the Relay Proxy took to reconnect
- Whether the monitoring timed out (indicating a problem)

### Documentation and Reporting
Use the timing data to document expected behavior:
- Include in runbooks
- Add to incident reports
- Share with support teams

## Troubleshooting

### Monitoring Times Out
If you see:
```
[TIMING] Monitoring timeout after 120.00 seconds. Last state: INTERRUPTED
```

This means the Relay Proxy didn't change state within the monitoring period. Possible causes:
- Relay Proxy container is stopped
- Relay Proxy is stuck in a bad state
- Network issues preventing status endpoint access

### No Summary Logs Appear
The background monitoring runs asynchronously. If you don't see summary logs:
- Wait longer (up to 2-4 minutes)
- Check if the Relay Proxy container is running
- Verify the Relay Proxy status endpoint is accessible

### Timing Seems Wrong
If timing values seem incorrect:
- Check system clock synchronization
- Verify no other processes are interfering with iptables
- Look for errors in the full logs (not just TIMING logs)

## Implementation Details

The timing instrumentation is implemented in `api-service/server.js`:

- `monitorRelayProxyConnectionState()`: Background monitoring function
- `/api/relay-proxy/disconnect`: Disconnect endpoint with timing
- `/api/relay-proxy/reconnect`: Reconnect endpoint with timing

The monitoring function:
- Uses `fetchWithTimeout()` to query the Relay Proxy status
- Checks every 2 seconds
- Tracks state transitions
- Logs detailed timing information
- Automatically cleans up after completion or timeout
