# Network Configuration

## Overview

All containers use static IP addresses on the `launchdarkly-network` bridge network to ensure consistent addressing across container restarts.

## Network Details

- **Network Name**: `launchdarkly-network`
- **Driver**: bridge
- **Subnet**: 172.18.0.0/16
- **Gateway**: 172.18.0.1

## Static IP Assignments

| Service | Container Name | Static IP | Purpose |
|---------|---------------|-----------|---------|
| **Dashboard** | dashboard | 172.18.0.10 | Web UI (Nginx) |
| **API Service** | api-service | 172.18.0.20 | API gateway for operations |
| **Node.js App** | node-app-dev | 172.18.0.30 | SDK demo (Relay Proxy mode) |
| **Relay Proxy** | relay-proxy | 172.18.0.40 | LaunchDarkly Relay Proxy |
| **Redis** | redis | 172.18.0.50 | Persistent data store |
| **PHP App** | php-app-dev | 172.18.0.60 | SDK demo (Daemon mode) |
| **Python App** | python-app-dev | 172.18.0.70 | SDK demo (Default mode) |

## Why Static IPs?

### Problem with Dynamic IPs

When containers restart, Docker can reassign IP addresses. This caused issues with:

1. **iptables Rules**: Disconnect functionality uses iptables rules to block specific IPs. If a container gets a new IP after restart, old rules can:
   - Block the wrong container (if another container gets the old IP)
   - Remain as stale rules that need manual cleanup

2. **Example Issue**: 
   - Relay Proxy had IP 172.18.0.5
   - Disconnect created iptables rule blocking 172.18.0.5
   - Containers restarted
   - Python got IP 172.18.0.5
   - Python couldn't connect to LaunchDarkly (blocked by old rule)

### Benefits of Static IPs

1. **Predictable Addressing**: Each service always has the same IP
2. **Reliable iptables Rules**: Disconnect/reconnect always targets the correct IP
3. **Easier Debugging**: Know exactly which IP belongs to which service
4. **No Stale Rules**: Rules always apply to the intended container
5. **Consistent Testing**: Network behavior is reproducible

## IP Address Scheme

The IP addresses are assigned in increments of 10 to allow for future expansion:

- **x.x.x.10-19**: Reserved for dashboard and UI services
- **x.x.x.20-29**: Reserved for API and gateway services
- **x.x.x.30-39**: Reserved for Node.js services
- **x.x.x.40-49**: Reserved for Relay Proxy and related services
- **x.x.x.50-59**: Reserved for data stores (Redis, databases)
- **x.x.x.60-69**: Reserved for PHP services
- **x.x.x.70-79**: Reserved for Python services
- **x.x.x.80-89**: Reserved for future services
- **x.x.x.90-99**: Reserved for future services

## Verifying IP Addresses

### Check All Container IPs

```bash
docker-compose ps -q | xargs docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

### Check Specific Container

```bash
docker inspect <container-name> -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

### Expected Output

```
/dashboard - 172.18.0.10
/api-service - 172.18.0.20
/node-app-dev - 172.18.0.30
/relay-proxy - 172.18.0.40
/redis - 172.18.0.50
/php-app-dev - 172.18.0.60
/python-app-dev - 172.18.0.70
```

## Disconnect/Reconnect Behavior

With static IPs, the disconnect functionality is more reliable:

### Disconnect
- Creates iptables rule blocking **172.18.0.40** (relay-proxy)
- Rule persists across container restarts
- Always blocks the correct container

### Reconnect
- Removes iptables rules for **172.18.0.40**
- Also cleans up any stale rules from previous sessions
- Ensures no other containers are accidentally blocked

## Troubleshooting

### Container Won't Start with IP Conflict

If you see an error like:
```
Error response from daemon: Address already in use
```

**Solution:**
1. Stop all containers: `docker-compose down`
2. Remove the network: `docker network rm launchdarkly-relay-proxy-enterprise-demo_launchdarkly-network`
3. Start containers: `docker-compose up -d`

### Check for IP Conflicts

```bash
docker network inspect launchdarkly-relay-proxy-enterprise-demo_launchdarkly-network
```

Look for any containers using the reserved IP addresses.

### Verify Network Configuration

```bash
docker network inspect launchdarkly-relay-proxy-enterprise-demo_launchdarkly-network | jq '.[0].IPAM'
```

Should show:
```json
{
  "Driver": "default",
  "Options": null,
  "Config": [
    {
      "Subnet": "172.18.0.0/16",
      "Gateway": "172.18.0.1"
    }
  ]
}
```

## Modifying IP Addresses

If you need to change an IP address:

1. Update `docker-compose.yml`:
   ```yaml
   networks:
     launchdarkly-network:
       ipv4_address: 172.18.0.XX
   ```

2. Recreate the container:
   ```bash
   docker-compose up -d <service-name>
   ```

3. Update this documentation

## Related Documentation

- `docker-compose.yml` - Network configuration
- `ACTUAL-CONNECTION-STATE.md` - Connection state monitoring
- `api-service/CONNECTION-TIMING.md` - Disconnect/reconnect timing
