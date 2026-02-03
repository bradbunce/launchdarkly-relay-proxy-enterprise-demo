# Hash Value Exposure - Project Structure

## Directory Structure

```
src/
├── nodejs/                          # Node.js implementation
│   ├── src/                        # Source files
│   │   ├── calculateHashValue.js   # Hash calculation using SHA-1
│   │   ├── HashValueExposer.js     # Main API facade
│   │   ├── logger.js               # Logging utilities
│   │   ├── murmurHash3.js          # Legacy (not used - SHA-1 is used instead)
│   │   └── validator.js            # Input validation
│   ├── tests/                      # Test files
│   │   ├── calculateHashValue.test.js
│   │   ├── calculateHashValue.pbt.test.js
│   │   ├── HashValueExposer.test.js
│   │   ├── HashValueExposer.pbt.test.js
│   │   ├── logger.pbt.test.js
│   │   ├── murmurHash3.test.js
│   │   ├── murmurHash3.pbt.test.js
│   │   └── validator.pbt.test.js
│   ├── package.json                # Node.js dependencies
│   ├── jest.config.js              # Jest configuration
│   ├── example.js                  # Usage example
│   ├── generate-test-vectors.js    # Test vector generator
│   ├── README.md                   # Node.js module documentation
│   └── .gitignore                  # Node.js ignore patterns
│
├── php/                            # PHP implementation
│   ├── src/                        # Source files
│   │   ├── CalculateHashValue.php  # Hash calculation using SHA-1
│   │   ├── HashValueExposer.php    # Main API facade
│   │   ├── Logger.php              # Logging utilities
│   │   ├── MurmurHash3.php         # Legacy (not used - SHA-1 is used instead)
│   │   └── Validator.php           # Input validation
│   ├── tests/                      # Test files
│   │   ├── CalculateHashValueTest.php
│   │   ├── CalculateHashValuePbtTest.php
│   │   ├── HashValueExposerTest.php
│   │   ├── LoggerTest.php
│   │   ├── MurmurHash3Test.php
│   │   ├── MurmurHash3PbtTest.php
│   │   └── ValidatorTest.php
│   ├── composer.json               # PHP dependencies
│   ├── phpunit.xml                 # PHPUnit configuration
│   ├── example.php                 # Usage example
│   ├── README.md                   # PHP module documentation
│   ├── SETUP.md                    # PHP setup instructions
│   └── .gitignore                  # PHP ignore patterns
│
└── PROJECT_STRUCTURE.md            # This file

test-vectors.json                   # Shared test vectors for cross-platform validation
```

## Implementation Status

### Hash Algorithm
- **Algorithm**: SHA-1 (not MurmurHash3)
- **Input Format**: `{flagKey}.{salt}.{contextKey}`
- **Hash Extraction**: First 15 hex characters (60 bits)
- **Bucket Calculation**: Divide by `0xFFFFFFFFFFFFFFF` (2^60 - 1)
- **Status**: ✅ Implemented and verified in both Node.js and PHP

### Node.js Implementation
- **Hash Calculation**: Uses Node.js `crypto.createHash('sha1')`
- **Test Coverage**: Unit tests and property-based tests
- **Status**: ✅ Complete and integrated into main application

### PHP Implementation
- **Hash Calculation**: Uses PHP `sha1()` function with GMP for large integers
- **Test Coverage**: Unit tests and property-based tests
- **Status**: ✅ Complete and integrated into main application

## Testing Frameworks

### Node.js
- **Test Runner**: Jest 29.7.0
- **Property-Based Testing**: fast-check 3.15.0
- **Configuration**: jest.config.js
- **Run Tests**: `npm test` (from src/nodejs/)
- **Status**: ✅ All tests passing

### PHP
- **Test Runner**: PHPUnit 9.6
- **Property-Based Testing**: Eris 0.14
- **Configuration**: phpunit.xml
- **Run Tests**: `composer test` (from src/php/)
- **Status**: ✅ All tests passing

## Shared Test Vectors

The `test-vectors.json` file contains shared test cases for validating cross-platform consistency between Node.js and PHP implementations. Both implementations produce identical hash and bucket values for the same inputs.

## Integration

Both implementations are integrated into the main LaunchDarkly Relay Proxy Enterprise Demo application:

- **Node.js**: Exposed via `/api/hash-value` endpoint in `src/app.js`
- **PHP**: Exposed via `/api/hash-value` endpoint in `php/index.php`
- **Dashboard**: Displays hash values in collapsible sections for both services
- **Documentation**: Comprehensive documentation added to README.md
