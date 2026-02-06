# Practical Example: Measuring Connection Timing

## Step-by-Step Guide

### Setup

1. **Start the system:**
   ```bash
   docker-compose up -d
   ```

2. **Open two terminal windows:**
   - Terminal 1: For watching logs
   - Terminal 2: For triggering disconnect/reconnect

### Terminal 1: Watch Timing Logs

```bash
docker logs -f api-service 2>&1 | grep "\[TIMING\]"
```

### Terminal 2: Test Disconnect

```bash
# Disconnect the Relay Proxy
curl -X POST http://localhost:4000/api/relay-proxy/disconnect
```

**Expected output in Terminal 1:**
```
[TIMING] Disconnect initiated at 2026-02-06T18:00:00.000Z
[TIMING] iptables rule applied in 1.05 seconds
[TIMING] Starting background monitoring to detect when Relay Proxy realizes disconnection...
```

**Wait 30-120 seconds, then you'll see:**
```
[TIMING] === DISCONNECT SUMMARY ===
[TIMING] iptables rule applied: 1.05s
[TIMING] Relay Proxy detected disconnection: 47.32s
[TIMING] Time for Relay Proxy to realize connection is gone: 46.27s
```

### Terminal 2: Test Reconnect

```bash
# Reconnect the Relay Proxy
curl -X POST http://localhost:4000/api/relay-proxy/reconnect
```

**Expected output in Terminal 1:**
```
[TIMING] Reconnect initiated at 2026-02-06T18:01:00.000Z
[TIMING] iptables rule removed in 0.18 seconds
[TIMING] Starting background monitoring to detect when Relay Proxy successfully reconnects...
```

**Wait 3-60 seconds, then you'll see:**
```
[TIMING] === RECONNECT SUMMARY ===
[TIMING] iptables rule removed: 0.18s
[TIMING] Relay Proxy successfully reconnected: 8.45s
[TIMING] Time from network available to successful reconnection: 8.27s
```

## Understanding the Results

### Disconnect Timing Breakdown

From the example above:
- **iptables rule applied: 1.05s** - Time to apply the network blocking rule
- **Relay Proxy detected disconnection: 47.32s** - Total time from disconnect initiated to detection
- **Time to realize connection is gone: 46.27s** - Time after rule applied until Relay Proxy noticed

This 46-second delay is normal TCP behavior. The existing streaming connection doesn't immediately know the network is blocked.

### Reconnect Timing Breakdown

From the example above:
- **iptables rule removed: 0.18s** - Time to remove the network blocking rule
- **Relay Proxy successfully reconnected: 8.45s** - Total time from reconnect initiated to success
- **Time from network available to successful reconnection: 8.27s** - Time after rule removed until reconnected

This 8-second delay is due to the Relay Proxy's retry schedule. It was waiting for its next retry attempt.

## Real-World Scenarios

### Scenario 1: Quick Disconnect/Reconnect Test

```bash
# Disconnect
curl -X POST http://localhost:4000/api/relay-proxy/disconnect

# Wait 10 seconds (before Relay Proxy realizes it's disconnected)
sleep 10

# Reconnect
curl -X POST http://localhost:4000/api/relay-proxy/reconnect
```

**Result:** Reconnection will be very fast (3-10 seconds) because the Relay Proxy is still in early retry attempts.

### Scenario 2: Long Disconnect Test

```bash
# Disconnect
curl -X POST http://localhost:4000/api/relay-proxy/disconnect

# Wait 5 minutes
sleep 300

# Reconnect
curl -X POST http://localhost:4000/api/relay-proxy/reconnect
```

**Result:** Reconnection will be slower (30-60+ seconds) because the Relay Proxy has backed off to longer retry intervals.

### Scenario 3: Monitoring During Dashboard Use

```bash
# In Terminal 1, watch logs
docker logs -f api-service 2>&1 | grep "\[TIMING\]"

# In Terminal 2, open dashboard
open http://localhost:8000

# Use the dashboard toggle to disconnect/reconnect
# Watch the timing logs appear in Terminal 1
```

## Collecting Data for Analysis

### Save Timing Logs to File

```bash
# Start logging to file
docker logs -f api-service 2>&1 | grep "\[TIMING\]" > timing-data.log

# In another terminal, run your tests
curl -X POST http://localhost:4000/api/relay-proxy/disconnect
sleep 60
curl -X POST http://localhost:4000/api/relay-proxy/reconnect
sleep 30

# Stop logging (Ctrl+C in first terminal)

# Analyze the results
cat timing-data.log
```

### Extract Key Metrics

```bash
# Get disconnect detection times
grep "Time for Relay Proxy to realize connection is gone" timing-data.log

# Get reconnection times
grep "Time from network available to successful reconnection" timing-data.log
```

## Troubleshooting

### No Summary Logs Appear

If you don't see the summary logs after waiting:

1. **Check if Relay Proxy is running:**
   ```bash
   docker ps | grep relay-proxy
   ```

2. **Check Relay Proxy status:**
   ```bash
   curl http://localhost:8030/status
   ```

3. **Check for errors in full logs:**
   ```bash
   docker logs api-service --tail 50
   ```

### Timing Seems Too Long

If reconnection takes longer than expected:

1. **Check how long it was disconnected:**
   - Short disconnect (< 1 min): Expect 3-10 second reconnect
   - Long disconnect (> 5 min): Expect 30-60+ second reconnect

2. **Check Relay Proxy logs for retry attempts:**
   ```bash
   docker logs relay-proxy --tail 100 | grep -i "retry\|connect"
   ```

### Monitoring Times Out

If you see timeout messages:

```
[TIMING] Monitoring timeout after 120.00 seconds. Last state: INTERRUPTED
```

This indicates the Relay Proxy didn't change state. Check:
- Is the container running?
- Is the status endpoint accessible?
- Are there errors in the Relay Proxy logs?

## Advanced: Automated Testing

Create a script to test multiple disconnect/reconnect cycles:

```bash
#!/bin/bash
# test-timing.sh

echo "Starting timing test..."

for i in {1..3}; do
  echo "=== Test $i ==="
  
  echo "Disconnecting..."
  curl -s -X POST http://localhost:4000/api/relay-proxy/disconnect | jq .timing
  
  echo "Waiting 60 seconds..."
  sleep 60
  
  echo "Reconnecting..."
  curl -s -X POST http://localhost:4000/api/relay-proxy/reconnect | jq .timing
  
  echo "Waiting 30 seconds..."
  sleep 30
done

echo "Test complete. Check logs for detailed timing."
```

Run it:
```bash
chmod +x test-timing.sh
./test-timing.sh
```

## Next Steps

- Review `api-service/CONNECTION-TIMING.md` for implementation details
- Check `TIMING-SUMMARY.md` for quick reference
- Use the timing data to document expected behavior in your runbooks
