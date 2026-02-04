/**
 * Hash calculation layer for LaunchDarkly bucketing
 * Calculates hash values from flag components and normalizes to bucket values
 * 
 * LaunchDarkly uses SHA-1 hashing, not MurmurHash3
 */

import crypto from 'crypto';
import { validateInputs } from './validator.js';

/**
 * Calculates hash and bucket value for flag evaluation
 * @param {string} flagKey - Feature flag key
 * @param {string} contextKey - User/context identifier
 * @param {string} salt - Salt value for hash
 * @returns {Object} { hashValue: number, bucketValue: number } or error object
 * @throws {Error} If inputs are invalid
 */
export function calculateHashValue(flagKey, contextKey, salt) {
  // Validate inputs
  const validationError = validateInputs(flagKey, contextKey, salt);
  if (validationError) {
    return validationError;
  }
  
  // LaunchDarkly's bucketing algorithm: {flagKey}.{salt}.{contextKey}
  const hashKey = `${flagKey}.${salt}.${contextKey}`;
  
  // Calculate SHA-1 hash
  const sha1Hash = crypto.createHash('sha1').update(hashKey).digest('hex');
  
  // Extract first 15 hex characters (60 bits) as per LaunchDarkly's algorithm
  const hashPrefix = sha1Hash.substring(0, 15);
  
  // Convert to integer and divide by 0xFFFFFFFFFFFFFFF (2^60 - 1)
  const hashValue = parseInt(hashPrefix, 16);
  const bucketValue = hashValue / 0xFFFFFFFFFFFFFFF;
  
  // Return object with hashValue and bucketValue
  return {
    hashValue,
    bucketValue
  };
}
