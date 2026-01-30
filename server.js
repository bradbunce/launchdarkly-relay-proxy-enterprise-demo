// Load environment variables from .env file
require('dotenv').config();

const { loadConfig } = require('./src/config');
const { initializeLaunchDarkly, closeLaunchDarkly } = require('./src/launchdarkly');
const { createApp } = require('./src/app');

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a fetch termination error (common when connections are closed)
  if (reason && reason.message && reason.message.includes('terminated')) {
    // Silently handle fetch termination errors - these are expected when connections close
    return;
  }
  
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  // Check if it's a fetch termination error
  if (error.message && error.message.includes('terminated')) {
    // Silently handle fetch termination errors
    return;
  }
  
  console.error('Uncaught Exception:', error);
  
  // Only exit for truly fatal errors (port binding, etc.)
  // Don't exit for SDK-related errors or network issues
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    console.error('Fatal error, exiting...');
    process.exit(1);
  } else {
    console.warn('Non-fatal error caught, continuing operation...');
  }
});

// Load and validate configuration
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error('Configuration error:', error.message);
  process.exit(1);
}

// Create Express app
const app = createApp();

// Configure port from validated configuration
const PORT = config.app.port;

// Initialize LaunchDarkly SDK and start server
async function startServer() {
  try {
    // Initialize LaunchDarkly SDK with validated configuration (singleton)
    const ldClient = await initializeLaunchDarkly(config.launchDarkly);
    
    if (ldClient) {
      console.log('LaunchDarkly SDK is ready');
    } else {
      console.warn('Starting server without LaunchDarkly SDK (graceful degradation)');
    }

    // Start server with error handling
    const server = app.listen(PORT, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
      console.log(`Server is running on port ${PORT}`);
    });

    // Handle server startup errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
      } else if (err.code === 'EACCES') {
        console.error(`Permission denied to bind to port ${PORT}`);
      } else {
        console.error('Server error:', err);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await closeLaunchDarkly();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
