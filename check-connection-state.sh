#!/bin/bash
# Script to check the actual Relay Proxy connection state
# This tells you when it's safe to test disconnected/connected behavior

echo "Checking Relay Proxy connection state..."
echo ""

while true; do
  # Get the current state
  response=$(curl -s http://localhost:4000/api/relay-proxy/actual-connection-state)
  
  # Extract key fields
  state=$(echo "$response" | jq -r '.state')
  connected=$(echo "$response" | jq -r '.connected')
  readyToTest=$(echo "$response" | jq -r '.readyToTest')
  message=$(echo "$response" | jq -r '.message')
  timestamp=$(echo "$response" | jq -r '.timestamp')
  
  # Clear the line and print status
  echo -ne "\r\033[K"  # Clear line
  
  if [ "$readyToTest" = "true" ]; then
    if [ "$connected" = "true" ]; then
      echo -ne "\r✅ CONNECTED - Ready to test | State: $state | $timestamp"
    else
      echo -ne "\r🔴 DISCONNECTED - Ready to test | State: $state | $timestamp"
    fi
  else
    echo -ne "\r⏳ TRANSITIONING - Wait before testing | State: $state | $timestamp"
  fi
  
  sleep 2
done
