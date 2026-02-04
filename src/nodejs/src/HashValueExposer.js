/**
 * HashValueExposer API for LaunchDarkly bucketing
 * Provides the main public API for exposing hash values
 */

import { calculateHashValue } from './calculateHashValue.js';
import { logHashValue } from './logger.js';

/**
 * HashValueExposer class
 * Exposes hash values for flag evaluations with optional logging
 */
export class HashValueExposer {
  /**
   * Exposes hash value for a flag evaluation
   * @param {Object} options - Configuration options
   * @param {string} options.flagKey - Feature flag key
   * @param {string} options.contextKey - User/context identifier
   * @param {string} options.salt - Salt value
   * @returns {Object} { hashValue, bucketValue, flagKey, contextKey, salt } or error object
   */
  expose(options) {
    // Extract parameters from options
    const { flagKey, contextKey, salt } = options || {};
    
    // Calculate hash value (includes validation)
    const result = calculateHashValue(flagKey, contextKey, salt);
    
    // If result is an error, return it
    if (result.error) {
      return result;
    }
    
    // Return result object with all required fields
    return {
      flagKey,
      contextKey,
      salt,
      hashValue: result.hashValue,
      bucketValue: result.bucketValue
    };
  }
  
  /**
   * Exposes hash value with logging
   * @param {Object} options - Same as expose()
   * @returns {Object} Same as expose()
   */
  exposeWithLogging(options) {
    // Call expose to get the result
    const result = this.expose(options);
    
    // If result is an error, don't log
    if (result.error) {
      return result;
    }
    
    // Log the result using the logger module
    logHashValue(result);
    
    return result;
  }
}
