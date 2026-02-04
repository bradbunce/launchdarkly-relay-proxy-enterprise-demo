#!/bin/sh
set -e

# Substitute environment variables in dashboard.html
echo "Substituting environment variables in dashboard.html..."
envsubst '${LAUNCHDARKLY_CLIENT_SIDE_ID}' < /usr/share/nginx/html/dashboard.template.html > /usr/share/nginx/html/dashboard.html

echo "Dashboard configured with client-side ID: ${LAUNCHDARKLY_CLIENT_SIDE_ID}"

# Execute the CMD
exec "$@"
