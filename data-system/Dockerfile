FROM python:3.11-alpine

WORKDIR /app

# curl for health checks, bind-tools for DNS probes
RUN apk add --no-cache curl bind-tools

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

# Single worker so the SDK singleton and data-source tracker stay consistent
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "1", "--worker-class", "gevent", "--timeout", "120", "app:app"]
