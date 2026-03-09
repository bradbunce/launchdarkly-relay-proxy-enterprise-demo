const EventEmitter = require('events');

/**
 * LogPatternParser analyzes log lines and detects connection state changes.
 * 
 * Events emitted:
 * - 'connection_detected': Emitted when a connection pattern is matched
 * - 'disconnection_detected': Emitted when a disconnection pattern is matched
 * - 'unknown_pattern': Emitted when an unrecognized pattern appears 10+ times
 * 
 * @extends EventEmitter
 */
class LogPatternParser extends EventEmitter {
  /**
   * Creates a new LogPatternParser instance.
   * Initializes connection and disconnection patterns with case-insensitive matching.
   */
  constructor() {
    super();
    
    // Connection patterns (case-insensitive)
    // Requirements 2.1, 2.2
    this.connectionPatterns = [
      /Received configuration/i,
      /Finished processing auto-configuration/i
    ];
    
    // Disconnection patterns (case-insensitive)
    // Requirements 3.1, 3.2
    // Note: Disconnection patterns have higher priority than connection patterns
    this.disconnectionPatterns = [
      /Error in stream connection/i,
      /dial tcp.*i\/o timeout/i
    ];
    
    // Track unrecognized patterns for frequency analysis
    // Requirement 5.4
    this.unrecognizedPatterns = new Map();
  }

  /**
   * Parses a log line and detects connection state changes.
   * Disconnection patterns are checked first (higher priority).
   * 
   * @param {string} line - The log line to parse
   * @returns {Object} Parse result with eventType and matched status
   *   - eventType: 'connection' | 'disconnection' | 'unknown'
   *   - matched: boolean indicating if a pattern was matched
   *   - pattern: The regex pattern that matched (if any)
   */
  parseLine(line) {
    if (typeof line !== 'string') {
      return { eventType: 'unknown', matched: false };
    }

    // Check disconnection patterns first (higher priority)
    // Requirement 3.1, 3.2
    for (const pattern of this.disconnectionPatterns) {
      if (pattern.test(line)) {
        this.emit('disconnection_detected', {
          line: line,
          timestamp: new Date(),
          pattern: pattern.source
        });
        return { 
          eventType: 'disconnection', 
          matched: true,
          pattern: pattern.source
        };
      }
    }

    // Check connection patterns
    // Requirement 2.1, 2.2
    for (const pattern of this.connectionPatterns) {
      if (pattern.test(line)) {
        this.emit('connection_detected', {
          line: line,
          timestamp: new Date(),
          pattern: pattern.source
        });
        return { 
          eventType: 'connection', 
          matched: true,
          pattern: pattern.source
        };
      }
    }

    // Track unrecognized patterns
    // Requirement 5.4
    this._trackUnrecognizedPattern(line);
    
    return { eventType: 'unknown', matched: false };
  }

  /**
   * Tracks unrecognized log patterns and emits warnings for frequent patterns.
   * Emits 'unknown_pattern' event when a pattern appears 10 or more times.
   * 
   * @private
   * @param {string} line - The unrecognized log line
   */
  _trackUnrecognizedPattern(line) {
    // Extract first 50 characters as pattern signature
    // This groups similar log lines together
    const signature = line.substring(0, 50);
    
    // Increment counter for this signature
    const count = (this.unrecognizedPatterns.get(signature) || 0) + 1;
    this.unrecognizedPatterns.set(signature, count);

    // Emit warning when pattern appears 10 times
    // Requirement 5.4
    if (count === 10) {
      this.emit('unknown_pattern', {
        signature: signature,
        count: count,
        fullLine: line,
        message: 'Frequent unrecognized pattern detected - consider adding to known patterns',
        timestamp: new Date()
      });
    }
  }

  /**
   * Adds a new pattern to the parser dynamically.
   * Useful for extending pattern recognition without modifying the class.
   * 
   * @param {string} type - Pattern type: 'connection' or 'disconnection'
   * @param {RegExp} pattern - The regex pattern to add
   * @throws {Error} If type is invalid or pattern is not a RegExp
   */
  addPattern(type, pattern) {
    if (!(pattern instanceof RegExp)) {
      throw new Error('Pattern must be a RegExp instance');
    }

    if (type === 'connection') {
      this.connectionPatterns.push(pattern);
    } else if (type === 'disconnection') {
      this.disconnectionPatterns.push(pattern);
    } else {
      throw new Error(`Invalid pattern type: ${type}. Must be 'connection' or 'disconnection'`);
    }
  }

  /**
   * Returns the current unrecognized pattern statistics.
   * Useful for debugging and pattern discovery.
   * 
   * @returns {Array<Object>} Array of pattern statistics sorted by frequency
   */
  getUnrecognizedPatterns() {
    const patterns = [];
    
    for (const [signature, count] of this.unrecognizedPatterns.entries()) {
      patterns.push({ signature, count });
    }
    
    // Sort by count (descending)
    return patterns.sort((a, b) => b.count - a.count);
  }

  /**
   * Clears the unrecognized pattern tracking.
   * Useful for resetting statistics.
   */
  clearUnrecognizedPatterns() {
    this.unrecognizedPatterns.clear();
  }
}

module.exports = LogPatternParser;
