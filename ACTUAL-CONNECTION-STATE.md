# Actual Connection State Implementation

## Overview

The dashboard now displays the **true connection state** of the Relay Proxy to LaunchDarkly, not just whether iptables rules are applied.

## What Changed

### Before
- Dashboard showed "Disconnected" immediately when toggle was clicked
- Based only on iptables rules (network blocking)
- **Problem**: Relay Proxy was still connected for 30-120 seconds after "Disconnected" was shown

### After
- Dashboard shows actual Relay Proxy connection state
- Polls `/api/relay-proxy/actual-connection-state` every 2 seconds
- Shows transitioning states: "Disconnecting...", "Reconnecting..."
- Only shows "Disconnected" or "Connected" when Relay Proxy has actually detected the state change

## Connection States

The dashboard now displays these states:

| State | Display | Meaning | Ready to Test |
|-------|---------|---------|---------------|
| `VALID` | **Connected** (green) | Relay Proxy is connected to LaunchDarkly | ✅ Yes |
| `INTERRUPTED` | **Disconnected** (red) | Relay Proxy detected disconnection | ✅ Yes |
| `OFF` | **Disconnected** (red) | Relay Proxy is offline | ✅ Yes |
| `INITIALIZING` | **Initializing...** (orange, pulsing) | Relay Proxy is starting up | ❌ No |
| Other | **Transitioning...** (orange, pulsing) | State is changing | ❌ No |
| `CONTAINER_STOPPED` | **Container Stopped** (gray) | Container is not running | ❌ No |
| `ERROR` | **Error** (red) | Cannot reach Relay Proxy | ❌ No |

## User Experience

### Disconnect Flow

1. **User clicks toggle to disconnect**
   - Dashboard immediately shows: **"Disconnecting..."** (orange, pulsing)
   - iptables rule is applied (< 1 second)
   - Relay Proxy still has active connection

2. **Wait 30-120 seconds**
   - Dashboard continues showing: **"Disconnecting..."**
   - Relay Proxy detects the connection is gone
   - State changes from `VALID` → `INTERRUPTED`

3. **Dashboard updates**
   - Dashboard shows: **"Disconnected"** (red, solid)
   - Console log: `[Connection State] ⚠️ DISCONNECTED - Ready to test disconnected behavior`
   - **Now safe to test disconnected behavior**

### Reconnect Flow

1. **User clicks toggle to reconnect**
   - Dashboard immediately shows: **"Reconnecting..."** (orange, pulsing)
   - iptables rule is removed (< 1 second)
   - Relay Proxy hasn't reconnected yet

2. **Wait 3-60+ seconds** (depends on exponential backoff)
   - Dashboard continues showing: **"Reconnecting..."**
   - Relay Proxy attempts to reconnect
   - State changes from `INTERRUPTED` → `VALID`

3. **Dashboard updates**
   - Dashboard shows: **"Connected"** (green, solid)
   - Console log: `[Connection State] ✅ CONNECTED - Ready to test connected behavior`
   - **Now safe to test connected behavior**

## API Endpoint

### `/api/relay-proxy/actual-connection-state`

**Response:**
```json
{
  "state": "VALID",
  "connected": true,
  "disconnected": false,
  "stateReason": "",
  "readyToTest": true,
  "message": "Relay Proxy is connected to LaunchDarkly - ready to test",
  "timestamp": "2026-02-08T14:31:33.563Z"
}
```

**Fields:**
- `state`: Current connection state (VALID, INTERRUPTED, OFF, INITIALIZING, etc.)
- `connected`: Boolean - true if state is VALID
- `disconnected`: Boolean - true if state is INTERRUPTED or OFF
- `stateReason`: Additional context about the state
- `readyToTest`: Boolean - true if state is stable (fully connected or fully disconnected)
- `message`: Human-readable description
- `timestamp`: When the state was checked

## Console Logging

The dashboard logs state changes to the browser console:

```
[Connection State] Changed from VALID to INTERRUPTED
[Connection State] ⚠️ DISCONNECTED - Ready to test disconnected behavior
```

```
[Connection State] Changed from INTERRUPTED to VALID
[Connection State] ✅ CONNECTED - Ready to test connected behavior
```

```
[Connection State] 🔄 TRANSITIONING - Connection state is changing
```

## Visual Indicators

### CSS Classes

- `.status-text.connected` - Green background, solid
- `.status-text.disconnected` - Red background, solid
- `.status-text.transitioning` - Orange background, pulsing animation
- `.status-text.stopped` - Gray background, solid
- `.status-text.error` - Red background, solid

### Pulsing Animation

The transitioning state uses a CSS animation to indicate the state is changing:

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

## Testing

### Manual Test

1. Open dashboard: http://localhost:8000
2. Open browser console (F12)
3. Click disconnect toggle
4. Watch for:
   - Immediate: "Disconnecting..." (orange, pulsing)
   - After 30-120s: "Disconnected" (red, solid)
   - Console log: "DISCONNECTED - Ready to test"
5. Click reconnect toggle
6. Watch for:
   - Immediate: "Reconnecting..." (orange, pulsing)
   - After 3-60s: "Connected" (green, solid)
   - Console log: "CONNECTED - Ready to test"

### API Test

```bash
# Check current state
curl http://localhost:4000/api/relay-proxy/actual-connection-state | jq .

# Disconnect
curl -X POST http://localhost:4000/api/relay-proxy/disconnect

# Watch state change (run multiple times)
watch -n 2 'curl -s http://localhost:4000/api/relay-proxy/actual-connection-state | jq .state'

# Reconnect
curl -X POST http://localhost:4000/api/relay-proxy/reconnect

# Watch state change back
watch -n 2 'curl -s http://localhost:4000/api/relay-proxy/actual-connection-state | jq .state'
```

## Implementation Details

### Dashboard Changes

- **File**: `public/dashboard.html`
- **Class**: `RelayProxyConnectionControl`
- **Polling**: Every 2 seconds (faster to catch transitions)
- **Endpoint**: `/api/relay-proxy/actual-connection-state`

### API Changes

- **File**: `api-service/server.js`
- **Endpoint**: `GET /api/relay-proxy/actual-connection-state`
- **Logic**: Queries Relay Proxy `/status` endpoint and examines `connectionStatus.state`

## Benefits

1. **Accurate Testing**: Users know when it's safe to test disconnected/connected behavior
2. **Clear Feedback**: Visual indication of transitioning states
3. **No Confusion**: Dashboard matches reality, not just network rules
4. **Better UX**: Users understand what's happening during the 30-120 second delay
5. **Console Logs**: Developers can see state changes in real-time

## Related Documentation

- `TIMING-SUMMARY.md` - Timing instrumentation for disconnect/reconnect
- `api-service/CONNECTION-TIMING.md` - Detailed timing documentation
- `TIMING-EXAMPLE.md` - Practical examples of timing measurement
