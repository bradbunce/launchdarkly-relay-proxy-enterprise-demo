FROM alpine:3.19

# Install squid proxy and netcat for health checks
RUN apk add --no-cache squid netcat-openbsd

# Copy squid configuration
COPY squid.conf /etc/squid/squid.conf

# Create cache directory and set permissions
RUN mkdir -p /var/cache/squid && \
    chown -R squid:squid /var/cache/squid && \
    mkdir -p /var/log/squid && \
    chown -R squid:squid /var/log/squid

# Initialize squid cache
RUN squid -z -N

# Expose proxy port
EXPOSE 3128

# Run squid in foreground
# Clean up stale PID file before starting (in case container was stopped uncleanly)
CMD ["sh", "-c", "rm -f /var/run/squid.pid && squid -N"]
