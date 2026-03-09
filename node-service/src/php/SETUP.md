# PHP Setup Instructions

## Prerequisites

PHP 7.4 or higher is required. You have PHP 8.5.2 installed.

## Installing Composer

Composer is required to install PHP dependencies. If not already installed:

### macOS (using Homebrew)
```bash
brew install composer
```

### Manual Installation
```bash
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php
php -r "unlink('composer-setup.php');"
sudo mv composer.phar /usr/local/bin/composer
```

## Installing Dependencies

Once Composer is installed, run:

```bash
cd src/php
composer install
```

## Running Tests

```bash
composer test
```

## Note

The PHP testing framework setup is complete. Dependencies need to be installed using Composer before running tests.
