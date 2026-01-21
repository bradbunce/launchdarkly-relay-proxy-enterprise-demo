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

# Install Redis PHP extension
RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del .build-deps

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Configure Nginx
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/http.d/default.conf

# Configure PHP-FPM to use Unix socket
RUN echo "listen = /var/run/php-fpm.sock" >> /usr/local/etc/php-fpm.d/zz-custom.conf \
    && echo "listen.owner = nginx" >> /usr/local/etc/php-fpm.d/zz-custom.conf \
    && echo "listen.group = nginx" >> /usr/local/etc/php-fpm.d/zz-custom.conf \
    && echo "listen.mode = 0660" >> /usr/local/etc/php-fpm.d/zz-custom.conf

# Disable opcache for development
RUN echo "opcache.enable=0" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.enable_cli=0" >> /usr/local/etc/php/conf.d/opcache.ini

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader

COPY index.php ./

# Configure Supervisor to run both Nginx and PHP-FPM
COPY supervisord.conf /etc/supervisord.conf

# Expose port 80
EXPOSE 80

# Start Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
