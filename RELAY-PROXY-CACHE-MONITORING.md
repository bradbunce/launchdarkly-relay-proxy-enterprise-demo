# Relay Proxy Cache Monitoring

## Overview

The dashboard displays real-time cache data from multiple sources to demonstrate how LaunchDarkly SDKs and the Relay Proxy work together. This document explains how the cache monitoring works and how it handles Redis availability.

## Cache Display Windows

### 1. Relay Proxy Cache
**Source**: api-service monitoring client (SDK in proxy mode)  
**Shows**: Real-time view of what the Relay Proxy is serving to downstream clients  
**Updates**: Via streaming connection to Relay Proxy

### 2. Node.js SDK Cache
**Source**: Node.js service SDK (proxy mode)  
**Shows**: What the Node.js application actually has in memory  
**Updates**: Via streaming connection to Relay Proxy

### 3. Redis Data Store
**Source**: PHP service reading directly from Redis  
**Shows**: Persistent flag data stored in Redis  
**Updates**: Polled every 5 seconds when Redis is available

### 4. PHP SDK Cache
**Source**: PHP service SDK (daemon mode)  
**Shows**: What the PHP application reads from Redis  
**Updates**: Polled every 5 seconds when Redis is available

## How Relay Proxy Cache Monitoring Works

The api-service creates a dedicated LaunchDarkly SDK client to monitor the Relay Proxy's cache:

```javascript
// Custom feature store that captures flag data
class CaptureStore {
  constructor() {
    this.data = { flags: {}, segments: {} };
    // Mark as initialized immediately - don't block on initial data
    // This allows streaming to work even when Redis is down
    this.isInitialized = true;
  }
  
  // Captures initial data when available
  init(allData, cb) { ... }
  
  // Captures streaming updates
  upsert(kind, item, cb) { ... }
}

// SDK client in proxy mode
relayProxyCacheClient = LD.init(sdkKey, {
  baseUri: 'http://relay-proxy:8030',
  streamUri: 'http://relay-proxy:8030',
  featureStore: captureStore,
  stream: true
});
```

**Key Design Decision**: The custom feature store marks itself as initialized immediately (`this.isInitialized = true` in constructor). This is critical for handling Redis failures.

## Behavior When Redis is Down

### Relay Proxy Behavior
When Redis is unavailable:
- ✅ Continues receiving updates from LaunchDarkly via streaming
- ✅ Keeps updates in in-memory cache
- ✅ Serves streaming updates to connected SDKs
- ❌ Cannot serve bulk "get all flags" requests (requires Redis)
- ❌ Cannot write updates to Redis (logs errors but continues)

### SDK Client Behavior

**Without the fix** (blocking on initialization):
- SDK tries to initialize by requesting all flags
- Relay Proxy tries to read from Redis to serve the request
- Redis is down, so request fails
- SDK never initializes, never receives streaming updates
- Dashboard shows stale data

**With the fix** (immediate initialization):
- SDK marks itself as initialized immediately
- Connects to Relay Proxy streaming endpoint
- Receives updates via streaming from Relay Proxy's in-memory cache
- Dashboard shows real-time updates even when Redis is down

## Cache Update Flow

### Normal Operation (Redis Available)
```
LaunchDarkly
    ↓ (streaming)
Relay Proxy
    ↓ (write)
Redis (persistence)
    ↓ (streaming)
├─→ Node.js SDK (proxy mode) → Dashboard
├─→ api-service monitoring (proxy mode) → Dashboard
└─→ PHP SDK (daemon mode, reads from Redis) → Dashboard
```

### Redis Down (Streaming Still Works)
```
LaunchDarkly
    ↓ (streaming)
Relay Proxy (in-memory cache)
    ↓ (streaming only)
├─→ Node.js SDK (proxy mode) → Dashboard ✅
└─→ api-service monitoring (proxy mode) → Dashboard ✅

Redis ❌ (down)
    ↓
PHP SDK (daemon mode) → Dashboard ❌ (stale data)
```

## Why This Design Works

1. **Proxy Mode SDKs**: Connect via streaming, which uses the Relay Proxy's in-memory cache
2. **Immediate Initialization**: Custom feature store doesn't block waiting for bulk data
3. **Streaming Updates**: The `upsert()` method receives updates even without initial data
4. **Resilient to Redis Failures**: Monitoring continues working when Redis is down

## Testing

### Test 1: Redis Down, Flag Update
1. Stop Redis: `docker stop redis`
2. Update a flag in LaunchDarkly
3. **Expected**: Both Relay Proxy Cache and Node.js SDK Cache show the update
4. **Expected**: Redis Data Store and PHP SDK Cache show stale data

### Test 2: Restart api-service While Redis Down
1. Stop Redis: `docker stop redis`
2. Restart api-service: `docker restart api-service`
3. Update a flag in LaunchDarkly
4. **Expected**: Relay Proxy Cache still shows updates (initializes immediately and connects via streaming)

### Test 3: Relay Proxy Restart While Disconnected
1. Disconnect Relay Proxy from LaunchDarkly (using dashboard toggle)
2. Restart Relay Proxy: `docker restart relay-proxy`
3. **Expected**: Dashboard shows "Disconnected" (not "Transitioning")
4. **Expected**: iptables blocking rule persists (static IP 172.18.0.40)

## Related Documentation

- `ACTUAL-CONNECTION-STATE.md` - How the dashboard detects actual Relay Proxy connection state
- `NETWORK-CONFIGURATION.md` - Static IP configuration for containers
- `TEST-DISCONNECT-PERSISTENCE.md` - Testing disconnect state persistence
- `TEST-REDIS-FALLBACK.md` - Testing Relay Proxy reading from Redis when LaunchDarkly is down
- `TIMING-SUMMARY.md` - Connection timing instrumentation
- `TIMING-EXAMPLE.md` - Example timing output

## Key Takeaways

1. **Streaming is resilient**: SDKs in proxy mode continue working when Redis is down
2. **Initialization matters**: Custom feature stores should not block on initial data
3. **In-memory cache is primary**: Relay Proxy serves streaming updates from memory, not Redis
4. **Redis is for persistence**: Used for disaster recovery and daemon mode SDKs
5. **Monitor what matters**: Dashboard shows real-time SDK behavior, not just Redis state
