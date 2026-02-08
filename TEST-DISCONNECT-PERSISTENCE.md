# Test: Disconnect State Persists Across Relay Proxy Restart

## Purpose
Verify that when the relay proxy is manually disconnected via the dashboard toggle, it remains disconnected even if the relay-proxy container is stopped and restarted.

## Test Steps

### 1. Initial State - Verify Connected
```bash
# Check relay proxy is running and connected
docker ps | grep relay-proxy
curl -s http://localhost:8030/status | jq '.environments[].connectionStatus.state'
# Should show: "VALID"
```

### 2. Manually Disconnect via Dashboard
- Open http://localhost:8000/dashboard.html
- Click the connection toggle to disconnect
- Wait for status to show "Disconnecting..." (orange)
- Wait 2-5 minutes for status to show "Disconnected" (red)

### 3. Verify iptables Rule Exists
```bash
# Check that iptables rule is blocking relay-proxy IP
docker exec api-service sh -c "docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -L DOCKER-USER -n -v | grep 172.18.0.40"
# Should show: DROP rule for 172.18.0.40
```

### 4. Restart Relay Proxy Container
```bash
docker restart relay-proxy
# Wait for container to start
sleep 5
```

### 5. Verify IP Address Unchanged
```bash
# Verify relay-proxy still has the same static IP
docker inspect relay-proxy --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# Should show: 172.18.0.40
```

### 6. Verify iptables Rule Still Exists
```bash
# Check that iptables rule still blocks relay-proxy IP
docker exec api-service sh -c "docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -L DOCKER-USER -n -v | grep 172.18.0.40"
# Should show: DROP rule for 172.18.0.40 (still there!)
```

### 7. Verify Relay Proxy Still Disconnected
```bash
# Check relay proxy connection status
curl -s http://localhost:8030/status | jq '.environments[].connectionStatus.state'
# Should show: "INTERRUPTED" or "OFF" (still disconnected!)
```

### 8. Verify Dashboard Shows Disconnected
- Refresh http://localhost:8000/dashboard.html
- Connection toggle should show "Disconnected" (red)
- Toggle should be in the OFF position

### 9. Manually Reconnect
- Click the connection toggle to reconnect
- Wait for status to show "Reconnecting..." (orange)
- Wait 30-60 seconds for status to show "Connected" (green)

### 10. Verify iptables Rule Removed
```bash
# Check that iptables rule is gone
docker exec api-service sh -c "docker run --rm --privileged --net=host --pid=host alpine nsenter -t 1 -m -u -n -i iptables -L DOCKER-USER -n -v | grep 172.18.0.40"
# Should show: (no output - rule removed)
```

## Expected Results

✅ **Disconnect state persists across relay-proxy container restart**
- iptables rule blocks traffic based on IP address (172.18.0.40)
- Static IP configuration ensures relay-proxy always gets the same IP
- Rule persists on Docker host even when container stops/restarts
- Only manual "Reconnect" action removes the iptables rule

## Why This Works

1. **Static IP Configuration**: relay-proxy always gets 172.18.0.40 (configured in docker-compose.yml)
2. **Host-Level iptables**: Rules are applied on the Docker host, not inside the container
3. **IP-Based Blocking**: Rule blocks traffic from 172.18.0.40, regardless of container lifecycle
4. **Explicit Reconnect Required**: Only the reconnect endpoint removes the iptables rule

## Alternative Test: Stop/Start Instead of Restart

```bash
# After step 3 (manual disconnect), try stop/start instead:
docker stop relay-proxy
docker start relay-proxy

# Then continue with steps 5-10
# Result should be the same - disconnect state persists
```
