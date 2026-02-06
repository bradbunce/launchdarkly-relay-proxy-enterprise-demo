# Connection Timing Summary

## Quick Reference

### What Was Added

Added timing instrumentation to track:
1. **Disconnect**: Time from iptables rule applied → Relay Proxy detects disconnection
2. **Reconnect**: Time from iptables rule removed → Relay Proxy successfully reconnects

### How to Use

1. **Start the system:**
   ```bash
   docker-compose up -d
   ```

2. **Watch timing logs:**
   ```bash
   docker logs -f api-service 2>&1 | grep "\[TIMING\]"
   ```

3. **Disconnect via dashboard or API:**
   ```bash
   curl -X POST http://localhost:4000/api/relay-proxy/disconnect
   ```

4. **Wait and observe logs** (30-120 seconds for disconnect detection)

5. **Reconnect via dashboard or API:**
   ```bash
   curl -X POST http://localhost:4000/api/relay-proxy/reconnect
   ```

6. **Wait and observe logs** (3-60+ seconds for reconnection)

### Example Output

**Disconnect:**
```
[TIMING] Disconnect initiated at 2026-02-06T17:52:19.681Z
[TIMING] iptables rule applied in 1.02 seconds
[TIMING] Starting background monitoring...
[TIMING] === DISCONNECT SUMMARY ===
[TIMING] iptables rule applied: 1.02s
[TIMING] Relay Proxy detected disconnection: 45.23s
[TIMING] Time for Relay Proxy to realize connection is gone: 44.21s
```

**Reconnect:**
```
[TIMING] Reconnect initiated at 2026-02-06T17:53:05.123Z
[TIMING] iptables rule removed in 0.15 seconds
[TIMING] Starting background monitoring...
[TIMING] === RECONNECT SUMMARY ===
[TIMING] iptables rule removed: 0.15s
[TIMING] Relay Proxy successfully reconnected: 12.45s
[TIMING] Time from network available to successful reconnection: 12.30s
```

### Expected Timings

| Event | Typical Duration | Notes |
|-------|-----------------|-------|
| iptables rule applied | < 2 seconds | Network blocking starts immediately |
| Relay Proxy detects disconnect | 30-120 seconds | TCP keepalive + app timeout |
| iptables rule removed | < 1 second | Network access restored immediately |
| Relay Proxy reconnects | 3-60+ seconds | Depends on exponential backoff state |

### Files Modified

- `api-service/server.js` - Added timing instrumentation and monitoring
- `api-service/connection-timing.test.js` - Tests for timing functionality
- `api-service/CONNECTION-TIMING.md` - Detailed documentation

### API Response Changes

Both endpoints now include timing information:

```json
{
  "success": true,
  "timing": {
    "disconnectStarted": "2026-02-06T17:52:19.681Z",
    "iptablesApplied": "2026-02-06T17:52:20.703Z",
    "iptablesElapsedMs": 1022
  }
}
```

### Background Monitoring

- Polls Relay Proxy `/status` endpoint every 2 seconds
- Detects state changes (INTERRUPTED for disconnect, VALID for reconnect)
- Logs detailed timing when state changes occur
- Times out after 2-4 minutes if no state change detected
- Runs asynchronously (doesn't block API response)

For complete documentation, see `api-service/CONNECTION-TIMING.md`
