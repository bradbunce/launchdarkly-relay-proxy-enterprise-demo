const { spawn } = require('child_process');
const EventEmitter = require('events');

/**
 * LogMonitor streams Docker logs from a container in real-time.
 * 
 * Events emitted:
 * - 'log_line': Emitted for each log line with {line: string, timestamp: Date}
 * - 'error': Emitted when log streaming fails with {error: Error, context: string}
 * - 'stopped': Emitted when monitoring stops
 * 
 * @extends EventEmitter
 */
class LogMonitor extends EventEmitter {
  /**
   * Creates a new LogMonitor instance.
   * 
   * @param {string} containerName - Name of the Docker container to monitor
   * @param {Object} options - Configuration options
   * @param {number} options.maxRestartAttempts - Maximum number of restart attempts (default: 3)
   * @param {number} options.restartDelay - Delay between restart attempts in ms (default: 5000)
   */
  constructor(containerName, options = {}) {
    super();
    this.containerName = containerName;
    this.logProcess = null;
    this.isMonitoring = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = options.maxRestartAttempts || 3;
    this.restartDelay = options.restartDelay || 5000;
  }

  /**
   * Starts monitoring Docker logs from the container.
   * Spawns 'docker logs -f <container> --tail 0' to stream new logs only.
   * 
   * @throws {Error} If monitoring is already active
   */
  start() {
    if (this.isMonitoring) {
      throw new Error('Log monitoring is already active');
    }

    try {
      // Spawn docker logs process
      // -f: Follow log output (stream)
      // --tail 0: Start from new logs only (don't replay history)
      this.logProcess = spawn('docker', [
        'logs',
        '-f',
        '--tail', '0',
        this.containerName
      ]);

      // Handle stdout (normal log output)
      this.logProcess.stdout.on('data', (data) => {
        this._handleLogData(data);
      });

      // Handle stderr (Docker logs can emit to stderr for container errors)
      this.logProcess.stderr.on('data', (data) => {
        this._handleLogData(data);
      });

      // Handle process errors (e.g., Docker socket unavailable, command not found)
      this.logProcess.on('error', (error) => {
        this.emit('error', { 
          error, 
          context: 'process_spawn',
          containerName: this.containerName
        });
        this._handleRestart();
      });

      // Handle process exit
      this.logProcess.on('exit', (code, signal) => {
        if (code !== 0 && this.isMonitoring) {
          // Check for specific error conditions
          const errorContext = this._determineErrorContext(code);
          
          this.emit('error', { 
            error: new Error(`Log process exited with code ${code}`),
            context: errorContext,
            exitCode: code,
            signal: signal,
            containerName: this.containerName
          });
          
          // Only restart if it's not a "container not found" error
          if (errorContext !== 'container_not_found') {
            this._handleRestart();
          } else {
            this.isMonitoring = false;
            this.emit('stopped', { reason: 'container_not_found' });
          }
        } else if (code === 0 && this.isMonitoring) {
          // Normal exit while monitoring (container stopped)
          this.isMonitoring = false;
          this.emit('stopped', { reason: 'container_stopped' });
        }
      });

      this.isMonitoring = true;
      this.restartAttempts = 0; // Reset restart counter on successful start
      
    } catch (error) {
      this.emit('error', {
        error,
        context: 'start_failed',
        containerName: this.containerName
      });
      throw error;
    }
  }

  /**
   * Stops monitoring Docker logs.
   * Kills the log streaming process gracefully.
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.logProcess) {
      try {
        this.logProcess.kill('SIGTERM');
        this.logProcess = null;
      } catch (error) {
        this.emit('error', {
          error,
          context: 'stop_failed',
          containerName: this.containerName
        });
      }
    }

    this.emit('stopped', { reason: 'manual_stop' });
  }

  /**
   * Restarts log monitoring.
   * Stops current monitoring and starts a new session.
   */
  restart() {
    this.stop();
    
    // Small delay before restart to allow cleanup
    setTimeout(() => {
      try {
        this.start();
      } catch (error) {
        this.emit('error', {
          error,
          context: 'restart_failed',
          containerName: this.containerName
        });
      }
    }, 100);
  }

  /**
   * Handles log data from stdout/stderr.
   * Splits data into lines and emits log_line events.
   * 
   * @private
   * @param {Buffer} data - Raw log data from Docker
   */
  _handleLogData(data) {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      this.emit('log_line', {
        line: line,
        timestamp: new Date()
      });
    });
  }

  /**
   * Handles automatic restart logic with exponential backoff.
   * 
   * @private
   */
  _handleRestart() {
    if (this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      
      const delay = this.restartDelay * this.restartAttempts; // Simple backoff
      
      setTimeout(() => {
        if (this.isMonitoring) { // Only restart if still supposed to be monitoring
          try {
            // Reset monitoring flag before restart to allow start() to proceed
            this.isMonitoring = false;
            this.logProcess = null;
            this.start();
          } catch (error) {
            this.emit('error', {
              error,
              context: 'restart_attempt_failed',
              attempt: this.restartAttempts,
              containerName: this.containerName
            });
          }
        }
      }, delay);
    } else {
      this.isMonitoring = false;
      this.emit('error', {
        error: new Error('Max restart attempts reached'),
        context: 'restart_failed',
        maxAttempts: this.maxRestartAttempts,
        containerName: this.containerName
      });
      this.emit('stopped', { reason: 'max_restarts_exceeded' });
    }
  }

  /**
   * Determines the error context based on exit code.
   * 
   * @private
   * @param {number} exitCode - Process exit code
   * @returns {string} Error context identifier
   */
  _determineErrorContext(exitCode) {
    // Docker exit codes:
    // 125: Docker daemon error
    // 126: Container command cannot be invoked
    // 127: Container command not found
    // 1: General error (often "no such container")
    
    if (exitCode === 1) {
      return 'container_not_found';
    } else if (exitCode === 125) {
      return 'docker_daemon_error';
    } else {
      return 'process_exit';
    }
  }

  /**
   * Returns the current monitoring status.
   * 
   * @returns {boolean} True if monitoring is active
   */
  isActive() {
    return this.isMonitoring;
  }
}

module.exports = LogMonitor;
