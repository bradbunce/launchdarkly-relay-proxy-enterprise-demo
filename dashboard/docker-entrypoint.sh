#!/bin/sh
set -e

# Substitute environment variables in dashboard.html
echo "Substituting environment variables in dashboard.html..."
envsubst '${LAUNCHDARKLY_CLIENT_SIDE_ID}' < /usr/share/nginx/html/dashboard.template.html > /usr/share/nginx/html/dashboard.html

# Substitute environment variables in terminal-panels.html
echo "Substituting environment variables in terminal-panels.html..."
envsubst '${LAUNCHDARKLY_CLIENT_SIDE_ID}' < /usr/share/nginx/html/terminal-panels.template.html > /usr/share/nginx/html/terminal-panels.html

echo "Dashboard configured with client-side ID: ${LAUNCHDARKLY_CLIENT_SIDE_ID}"

# Execute the CMD
exec "$@"
