FROM python:3.11-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Run with Gunicorn for production with gevent worker for SSE support
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--worker-class", "gevent", "--timeout", "120", "app:app"]
