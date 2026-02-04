FROM nginx:alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext

# Copy static files
COPY public/dashboard.html /usr/share/nginx/html/dashboard.template.html
COPY public/*.js /usr/share/nginx/html/
COPY public/*.svg /usr/share/nginx/html/
COPY public/*.png /usr/share/nginx/html/
COPY public/index.html /usr/share/nginx/html/

# Copy nginx configuration
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY dashboard/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8000/ || exit 1

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
