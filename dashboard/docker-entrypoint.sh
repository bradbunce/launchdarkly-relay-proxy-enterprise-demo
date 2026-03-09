#!/bin/sh
set -e

# Define all variables for substitution
ENVSUBST_VARS='${LAUNCHDARKLY_CLIENT_SIDE_ID} ${DASHBOARD_PORT} ${API_SERVICE_PORT} ${NODE_SERVICE_PORT} ${PHP_SERVICE_PORT} ${PYTHON_SERVICE_PORT} ${SQUID_PROXY_PORT}'

# Substitute environment variables in dashboard.html
echo "Substituting environment variables in dashboard.html..."
envsubst "$ENVSUBST_VARS" < /usr/share/nginx/html/dashboard.template.html > /usr/share/nginx/html/dashboard.html
echo "Dashboard port variables: DASHBOARD_PORT=${DASHBOARD_PORT}, API_SERVICE_PORT=${API_SERVICE_PORT}, NODE_SERVICE_PORT=${NODE_SERVICE_PORT}"

# Substitute environment variables in terminal-panels.html
echo "Substituting environment variables in terminal-panels.html..."
envsubst "$ENVSUBST_VARS" < /usr/share/nginx/html/terminal-panels.template.html > /usr/share/nginx/html/terminal-panels.html
echo "Terminal panels port variables: PHP_SERVICE_PORT=${PHP_SERVICE_PORT}, PYTHON_SERVICE_PORT=${PYTHON_SERVICE_PORT}, SQUID_PROXY_PORT=${SQUID_PROXY_PORT}"

echo "Dashboard configured with client-side ID: ${LAUNCHDARKLY_CLIENT_SIDE_ID}"

# Execute the CMD
exec "$@"
