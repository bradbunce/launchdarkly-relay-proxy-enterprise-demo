FROM php:8.3-fpm-alpine

# Install system dependencies (including redis-cli)
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    git \
    redis

# Install PHP extensions
RUN docker-php-ext-install pcntl

# Install GMP extension for large integer handling
RUN apk add --no-cache gmp-dev \
    && docker-php-ext-install gmp

# Install Redis PHP extension from Alpine repository
RUN apk add --no-cache php83-pecl-redis \
    && ln -s /usr/lib/php83/modules/redis.so /usr/local/lib/php/extensions/no-debug-non-zts-20230831/redis.so \
    && docker-php-ext-enable redis

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Configure Nginx
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/http.d/default.conf

# Configure PHP-FPM with custom pool settings
COPY www.conf /usr/local/etc/php-fpm.d/www.conf

# Disable opcache for development
RUN echo "opcache.enable=0" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.enable_cli=0" >> /usr/local/etc/php/conf.d/opcache.ini

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY composer.json ./

# Copy HashValueExposer library
COPY hash-exposer-src ./hash-exposer/src/

RUN composer install --no-dev --optimize-autoloader

COPY index.php ./

# Configure Supervisor to run both Nginx and PHP-FPM
COPY supervisord.conf /etc/supervisord.conf

# Expose port 80
EXPOSE 80

# Start Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
