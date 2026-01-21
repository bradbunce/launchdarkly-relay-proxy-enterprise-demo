const { execSync } = require('child_process');
const fc = require('fast-check');
const http = require('http');

describe('Docker Build Unit Tests', () => {
  /**
   * Requirements: 3.1
   * Test that Dockerfile builds successfully
   */
  test('Dockerfile builds successfully', () => {
    let buildSucceeded = false;
    let buildOutput = '';

    try {
      // Attempt to build the Docker image
      buildOutput = execSync('docker build -t launchdarkly-demo-app-test .', {
        encoding: 'utf-8',
        timeout: 120000 // 2 minute timeout for build
      });
      buildSucceeded = true;
    } catch (error) {
      buildOutput = error.stdout || error.stderr || error.message;
      buildSucceeded = false;
    }

    // Verify build succeeded
    expect(buildSucceeded).toBe(true);
    
    // Verify build output exists (build produces output)
    if (buildSucceeded) {
      expect(buildOutput).toBeDefined();
    }
  }, 150000); // 2.5 minute timeout for test

  /**
   * Requirements: 3.1
   * Test that container starts without errors
   */
  test('Container starts without errors', () => {
    let containerStarted = false;
    let containerId = '';

    try {
      // Start the container in detached mode
      containerId = execSync(
        'docker run -d -p 3001:3000 -e LAUNCHDARKLY_SDK_KEY=test-key launchdarkly-demo-app-test',
        {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 30000 // 30 second timeout
        }
      ).trim();

      // Wait a moment for container to initialize
      execSync('sleep 2', { encoding: 'utf-8' });

      // Check if container is running
      const containerStatus = execSync(`docker ps -q -f id=${containerId}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      containerStarted = containerStatus.length > 0;

      // Get container logs to verify no startup errors
      const logs = execSync(`docker logs ${containerId}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Verify container started successfully
      expect(containerStarted).toBe(true);
      expect(containerId).toBeTruthy();
      expect(logs).toBeTruthy();

    } catch (error) {
      containerStarted = false;
      
      // If test fails, still try to clean up
      if (containerId) {
        try {
          execSync(`docker stop ${containerId}`, { stdio: 'ignore' });
          execSync(`docker rm ${containerId}`, { stdio: 'ignore' });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }

      throw error;
    } finally {
      // Clean up: stop and remove container
      if (containerId) {
        try {
          execSync(`docker stop ${containerId}`, { stdio: 'ignore' });
          execSync(`docker rm ${containerId}`, { stdio: 'ignore' });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }
  }, 60000); // 1 minute timeout for test
});


describe('Inter-Container Network Connectivity Property Tests', () => {
  /**
   * Feature: launchdarkly-demo-app, Property 4: Inter-Container Network Connectivity
   * Validates: Requirements 4.3
   * 
   * Property: For any Docker Compose deployment, the application container should be 
   * able to resolve the relay-proxy container by its service name and establish 
   * network connections to it.
   */
  test('Property 4: Inter-Container Network Connectivity', async () => {
    // Helper function to wait for services to be ready
    const waitForServices = (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    };

    // Helper function to check if a service is accessible via HTTP
    const isServiceAccessible = async (url, maxRetries = 10, delayMs = 1000) => {
      for (let i = 0; i < maxRetries; i++) {
        const accessible = await new Promise((resolve) => {
          const req = http.get(url, (res) => {
            resolve(true);
          });
          
          req.on('error', () => {
            resolve(false);
          });
          
          req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (accessible) {
          return true;
        }

        // Wait before retrying
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      return false;
    };

    // Generate different network configurations
    // Test with different SDK keys (alphanumeric only to avoid shell escaping issues)
    const sdkKeyArbitrary = fc.string({ 
      minLength: 20, 
      maxLength: 40,
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split(''))
    });

    await fc.assert(
      fc.asyncProperty(
        sdkKeyArbitrary,
        async (sdkKey) => {
          let composeStarted = false;

          try {
            // Ensure any previous compose stack is down
            try {
              execSync('docker-compose down', { 
                stdio: 'ignore',
                timeout: 30000
              });
            } catch (e) {
              // Ignore if nothing to bring down
            }

            // Start Docker Compose stack with generated SDK key
            // Use env option to safely pass environment variables
            execSync('docker-compose up -d', {
              encoding: 'utf-8',
              stdio: 'pipe',
              timeout: 60000,
              env: { ...process.env, LAUNCHDARKLY_SDK_KEY: sdkKey }
            });

            composeStarted = true;

            // Wait for services to initialize
            await waitForServices(5000);

            // Verify both containers are running
            const appContainerStatus = execSync(
              'docker-compose ps -q app',
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim();

            const relayContainerStatus = execSync(
              'docker-compose ps -q relay-proxy',
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim();

            // Property assertion: Both containers should be running
            expect(appContainerStatus).toBeTruthy();
            expect(relayContainerStatus).toBeTruthy();

            // Property assertion: App container should be accessible from host
            const appAccessible = await isServiceAccessible('http://localhost:3000', 15, 1000);
            expect(appAccessible).toBe(true);

            // Property assertion: Relay proxy should be accessible from host
            const relayAccessible = await isServiceAccessible('http://localhost:8030/status', 15, 1000);
            expect(relayAccessible).toBe(true);

            // Property assertion: App container should be able to resolve relay-proxy by service name
            // We verify this by checking the app container's logs for successful connection attempts
            // or by executing a network test inside the app container
            const appContainerId = appContainerStatus;
            
            // Test DNS resolution inside app container
            const dnsResolution = execSync(
              `docker exec ${appContainerId} sh -c "getent hosts relay-proxy"`,
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim();

            // Property assertion: DNS resolution should succeed
            expect(dnsResolution).toBeTruthy();
            expect(dnsResolution).toContain('relay-proxy');

            // Test network connectivity from app to relay-proxy
            // Use wget or curl to test HTTP connectivity
            let networkConnectivity = false;
            try {
              const connectivityTest = execSync(
                `docker exec ${appContainerId} sh -c "wget -q -O- --timeout=5 http://relay-proxy:8030/status || curl -s --max-time 5 http://relay-proxy:8030/status"`,
                { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 }
              );
              networkConnectivity = true;
            } catch (error) {
              // If both wget and curl fail, connectivity is not established
              networkConnectivity = false;
            }

            // Property assertion: Network connectivity should be established
            expect(networkConnectivity).toBe(true);

            // Additional verification: Check app logs for relay proxy connection attempts
            const appLogs = execSync(
              `docker logs ${appContainerId}`,
              { encoding: 'utf-8', stdio: 'pipe' }
            );

            // Verify logs contain relay proxy URL reference
            expect(appLogs).toContain('relay-proxy');

          } catch (error) {
            console.error(`Inter-container connectivity test failed:`, error.message);
            
            // Log container status for debugging
            if (composeStarted) {
              try {
                const psOutput = execSync('docker-compose ps', { 
                  encoding: 'utf-8',
                  stdio: 'pipe'
                });
                console.log('Container status:', psOutput);
              } catch (e) {
                // Ignore
              }
            }
            
            throw error;
          } finally {
            // Clean up: stop and remove all services
            if (composeStarted) {
              try {
                execSync('docker-compose down', { 
                  stdio: 'ignore',
                  timeout: 30000
                });
              } catch (cleanupError) {
                console.warn('Cleanup warning:', cleanupError.message);
              }
            }
          }
        }
      ),
      { 
        numRuns: 3,             // Reduced to 3 iterations for practical testing (each run takes ~30 seconds)
        timeout: 60000,         // 60 second timeout per test case
        endOnFailure: true      // Stop on first failure for easier debugging
      }
    );
  }, 240000); // 4 minute timeout for entire property test (3 runs * ~60 seconds each)
});

describe('Docker Workflow Integration Tests', () => {
  /**
   * Requirements: 5.1
   * Test that docker-compose build succeeds
   */
  test('docker-compose build succeeds', () => {
    let buildSucceeded = false;
    let buildOutput = '';

    try {
      // Ensure clean state
      try {
        execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
      } catch (e) {
        // Ignore if nothing to bring down
      }

      // Attempt to build using docker-compose
      buildOutput = execSync('docker-compose build', {
        encoding: 'utf-8',
        timeout: 180000 // 3 minute timeout for build
      });
      buildSucceeded = true;
    } catch (error) {
      buildOutput = error.stdout || error.stderr || error.message;
      buildSucceeded = false;
    }

    // Verify build succeeded
    expect(buildSucceeded).toBe(true);
    
    // Verify build output exists
    if (buildSucceeded) {
      expect(buildOutput).toBeDefined();
    }
  }, 200000); // 3.5 minute timeout for test

  /**
   * Requirements: 5.2
   * Test that docker-compose up starts both containers
   */
  test('docker-compose up starts both containers', async () => {
    let composeStarted = false;

    try {
      // Ensure clean state
      try {
        execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
      } catch (e) {
        // Ignore if nothing to bring down
      }

      // Start Docker Compose stack
      execSync('docker-compose up -d', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 90000 // 1.5 minute timeout
      });

      composeStarted = true;

      // Wait for services to initialize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify both containers are running
      const appContainerStatus = execSync(
        'docker-compose ps -q app',
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      const relayContainerStatus = execSync(
        'docker-compose ps -q relay-proxy',
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      // Both containers should be running
      expect(appContainerStatus).toBeTruthy();
      expect(relayContainerStatus).toBeTruthy();

      // Verify containers are actually running (not just created)
      const runningContainers = execSync('docker-compose ps', {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      expect(runningContainers).toContain('app');
      expect(runningContainers).toContain('relay-proxy');

    } catch (error) {
      console.error('docker-compose up test failed:', error.message);
      throw error;
    } finally {
      // Clean up
      if (composeStarted) {
        try {
          execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }
      }
    }
  }, 150000); // 2.5 minute timeout for test

  /**
   * Requirements: 5.2
   * Test that application is accessible at localhost:3000
   */
  test('application is accessible at localhost:3000', async () => {
    let composeStarted = false;

    try {
      // Ensure clean state
      try {
        execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
      } catch (e) {
        // Ignore if nothing to bring down
      }

      // Start Docker Compose stack
      execSync('docker-compose up -d', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 90000
      });

      composeStarted = true;

      // Wait for services to initialize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Helper function to check if application is accessible with retries
      const isAppAccessible = async (maxRetries = 15, delayMs = 1000) => {
        for (let i = 0; i < maxRetries; i++) {
          const accessible = await new Promise((resolve) => {
            const req = http.get('http://localhost:3000', (res) => {
              resolve(res.statusCode === 200);
            });
            
            req.on('error', () => {
              resolve(false);
            });
            
            req.setTimeout(2000, () => {
              req.destroy();
              resolve(false);
            });
          });

          if (accessible) {
            return true;
          }

          // Wait before retrying
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        return false;
      };

      // Verify application is accessible
      const isAccessible = await isAppAccessible();
      expect(isAccessible).toBe(true);

      // Make actual HTTP request to verify response content
      const response = await new Promise((resolve, reject) => {
        http.get('http://localhost:3000', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }).on('error', reject);
      });

      // Verify we get a valid HTTP response with expected content
      expect(response.statusCode).toBe(200);
      expect(response.data).toBeTruthy();
      expect(response.data).toContain('LaunchDarkly');

    } catch (error) {
      console.error('Application accessibility test failed:', error.message);
      throw error;
    } finally {
      // Clean up
      if (composeStarted) {
        try {
          execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }
      }
    }
  }, 150000); // 2.5 minute timeout for test

  /**
   * Requirements: 5.3
   * Test that docker-compose down stops all services
   */
  test('docker-compose down stops all services', async () => {
    let composeStarted = false;

    try {
      // Ensure clean state
      try {
        execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
      } catch (e) {
        // Ignore if nothing to bring down
      }

      // Start Docker Compose stack
      execSync('docker-compose up -d', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 90000
      });

      composeStarted = true;

      // Wait for services to initialize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify containers are running before stopping
      const beforeStop = execSync('docker-compose ps -q', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      expect(beforeStop).toBeTruthy();

      // Stop all services using docker-compose down
      const downOutput = execSync('docker-compose down', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30000
      });

      composeStarted = false; // Mark as stopped

      // Verify down command executed
      expect(downOutput).toBeDefined();

      // Wait a moment for containers to fully stop
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify no containers are running
      const afterStop = execSync('docker-compose ps -q', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      // Should return empty string (no containers)
      expect(afterStop).toBe('');

      // Verify application is no longer accessible
      const isStillAccessible = await new Promise((resolve) => {
        const req = http.get('http://localhost:3000', (res) => {
          resolve(true);
        });
        
        req.on('error', () => {
          resolve(false);
        });
        
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      // Application should not be accessible after stopping
      expect(isStillAccessible).toBe(false);

    } catch (error) {
      console.error('docker-compose down test failed:', error.message);
      throw error;
    } finally {
      // Ensure cleanup even if test fails
      if (composeStarted) {
        try {
          execSync('docker-compose down', { stdio: 'ignore', timeout: 30000 });
        } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError.message);
        }
      }
    }
  }, 150000); // 2.5 minute timeout for test
});

describe('Container Port Accessibility Property Tests', () => {
  /**
   * Feature: launchdarkly-demo-app, Property 3: Container Port Accessibility
   * Validates: Requirements 3.3
   * 
   * Property: For any Docker container deployment with a configured port, when the 
   * application container is running, the HTTP server should be accessible from the 
   * host system on that port.
   */
  test('Property 3: Container Port Accessibility', async () => {
    // Helper function to check if a port is accessible via HTTP with retries
    const isPortAccessible = async (port, maxRetries = 10, delayMs = 1000) => {
      for (let i = 0; i < maxRetries; i++) {
        const accessible = await new Promise((resolve) => {
          const req = http.get(`http://localhost:${port}`, (res) => {
            resolve(true);
          });
          
          req.on('error', () => {
            resolve(false);
          });
          
          req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (accessible) {
          return true;
        }

        // Wait before retrying
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      return false;
    };

    // Helper function to wait for container to be ready
    const waitForContainer = (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    };

    // Generate valid port numbers (avoiding common system ports and conflicts)
    // Using ports in range 3100-3199 to avoid conflicts with default 3000-3001
    const portArbitrary = fc.integer({ min: 3100, max: 3199 });

    await fc.assert(
      fc.asyncProperty(
        portArbitrary,
        async (hostPort) => {
          let containerId = '';
          let containerStarted = false;

          try {
            // Check if Docker image exists, build only if needed
            const imageExists = execSync('docker images -q launchdarkly-demo-app-test', { 
              encoding: 'utf-8',
              stdio: 'pipe'
            }).trim();

            if (!imageExists) {
              // Image doesn't exist, build it once
              execSync('docker build -t launchdarkly-demo-app-test .', {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 120000
              });
            }

            // Start container with the generated port mapping
            containerId = execSync(
              `docker run -d -p ${hostPort}:3000 -e LAUNCHDARKLY_SDK_KEY=test-key launchdarkly-demo-app-test`,
              {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 30000
              }
            ).trim();

            // Wait for container to initialize
            await waitForContainer(2000);

            // Verify container is running
            const containerStatus = execSync(`docker ps -q -f id=${containerId}`, {
              encoding: 'utf-8',
              stdio: 'pipe'
            }).trim();

            containerStarted = containerStatus.length > 0;

            // Property assertion: Container should be running
            expect(containerStarted).toBe(true);

            // Property assertion: HTTP server should be accessible on the configured port
            // Use retry logic to wait for server to be fully ready
            const isAccessible = await isPortAccessible(hostPort, 10, 1000);
            expect(isAccessible).toBe(true);

            // Additional verification: Make actual HTTP request to verify response
            if (isAccessible) {
              const response = await new Promise((resolve, reject) => {
                http.get(`http://localhost:${hostPort}`, (res) => {
                  let data = '';
                  res.on('data', chunk => data += chunk);
                  res.on('end', () => resolve({ statusCode: res.statusCode, data }));
                }).on('error', reject);
              });

              // Verify we get a valid HTTP response
              expect(response.statusCode).toBe(200);
              expect(response.data).toBeTruthy();
            }

          } catch (error) {
            // If test fails, log error for debugging
            console.error(`Port ${hostPort} test failed:`, error.message);
            throw error;
          } finally {
            // Clean up: stop and remove container
            if (containerId) {
              try {
                execSync(`docker stop ${containerId}`, { 
                  stdio: 'ignore',
                  timeout: 10000
                });
                execSync(`docker rm ${containerId}`, { 
                  stdio: 'ignore',
                  timeout: 10000
                });
              } catch (cleanupError) {
                // Ignore cleanup errors
                console.warn(`Cleanup warning for container ${containerId}:`, cleanupError.message);
              }
            }
          }
        }
      ),
      { 
        numRuns: 5,             // Reduced to 5 iterations for practical testing (each run takes ~15 seconds)
        timeout: 30000,         // 30 second timeout per test case
        endOnFailure: true      // Stop on first failure for easier debugging
      }
    );
  }, 180000); // 3 minute timeout for entire property test (5 runs * ~30 seconds each)
});
