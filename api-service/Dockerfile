FROM node:24-alpine

WORKDIR /app

# Install curl for healthcheck and docker-cli for container operations
RUN apk add --no-cache curl docker-cli

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start server
CMD ["node", "server.js"]
