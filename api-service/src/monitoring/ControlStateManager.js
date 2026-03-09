const EventEmitter = require('events');

/**
 * ControlStateManager
 * 
 * Manages the toggle control's enabled/disabled state during state transitions.
 * When a disconnect/reconnect action is initiated, the toggle is disabled until
 * log monitoring confirms the state change (or 60-second timeout occurs).
 * This prevents concurrent actions.
 * 
 * Events emitted:
 * - control_disabled: When toggle is disabled due to action initiation
 * - control_enabled: When toggle is re-enabled after state change or timeout
 * - action_timeout: When no state change confirmation occurs within 60 seconds
 */
class ControlStateManager extends EventEmitter {
  constructor() {
    super();
    this.controlEnabled = true;
    this.pendingAction = null; // 'disconnect', 'reconnect', or null
    this.actionStartTime = null;
    this.timeoutHandle = null;
    this.timeoutDuration = 60000; // 60 seconds timeout for state transitions
  }

  /**
   * Initiates an action (disconnect or reconnect) and disables the toggle control.
   * Starts a 60-second timeout timer.
   * 
   * @param {string} action - The action to initiate ('disconnect' or 'reconnect')
   * @returns {Object} Result object with success status and details
   */
  initiateAction(action) {
    // Check for concurrent action
    if (this.pendingAction !== null) {
      return {
        success: false,
        error: 'action_already_pending',
        message: `Cannot initiate ${action} while ${this.pendingAction} is pending`
      };
    }

    // Disable control
    this.controlEnabled = false;
    this.pendingAction = action;
    this.actionStartTime = Date.now();

    // Start timeout timer
    this.timeoutHandle = setTimeout(() => {
      this.handleTimeout();
    }, this.timeoutDuration);

    this.emit('control_disabled', {
      action: action,
      timestamp: new Date()
    });

    return {
      success: true,
      action: action,
      controlEnabled: false
    };
  }

  /**
   * Completes the pending action and re-enables the toggle control.
   * Called when log monitoring confirms the state change.
   */
  completeAction() {
    if (this.pendingAction === null) {
      return; // No action to complete
    }

    const completedAction = this.pendingAction;
    const latency = Date.now() - this.actionStartTime;

    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Enable control
    this.controlEnabled = true;
    this.pendingAction = null;
    this.actionStartTime = null;

    this.emit('control_enabled', {
      completedAction: completedAction,
      latency: latency,
      timestamp: new Date()
    });
  }

  /**
   * Handles timeout when no state change confirmation occurs within 60 seconds.
   * Re-enables the toggle control and emits timeout error.
   */
  handleTimeout() {
    const timedOutAction = this.pendingAction;

    // Enable control
    this.controlEnabled = true;
    this.pendingAction = null;
    this.actionStartTime = null;

    this.emit('action_timeout', {
      action: timedOutAction,
      timeout: this.timeoutDuration,
      timestamp: new Date()
    });

    this.emit('control_enabled', {
      reason: 'timeout',
      timestamp: new Date()
    });
  }

  /**
   * Returns whether the toggle control is currently enabled.
   * 
   * @returns {boolean} True if control is enabled, false otherwise
   */
  isControlEnabled() {
    return this.controlEnabled;
  }

  /**
   * Returns the currently pending action, if any.
   * 
   * @returns {string|null} The pending action ('disconnect', 'reconnect') or null
   */
  getPendingAction() {
    return this.pendingAction;
  }
}

module.exports = ControlStateManager;
