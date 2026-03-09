/**
 * Input validation module for hash value exposure
 * Validates inputs and provides descriptive error messages
 */

/**
 * Validates inputs for hash calculation
 * @param {string} flagKey - Feature flag key
 * @param {string} contextKey - User/context identifier
 * @param {string} salt - Salt value for hash
 * @returns {Object|null} Error object if validation fails, null if valid
 */
export function validateInputs(flagKey, contextKey, salt) {
  // Validate flagKey
  if (flagKey === null || flagKey === undefined) {
    return {
      error: 'INVALID_INPUT',
      message: 'flagKey is required and must be a non-empty string',
      field: 'flagKey'
    };
  }
  
  if (typeof flagKey !== 'string') {
    return {
      error: 'TYPE_ERROR',
      message: 'flagKey must be a string',
      field: 'flagKey'
    };
  }
  
  if (flagKey === '') {
    return {
      error: 'INVALID_INPUT',
      message: 'flagKey is required and must be a non-empty string',
      field: 'flagKey'
    };
  }
  
  // Validate contextKey
  if (contextKey === null || contextKey === undefined) {
    return {
      error: 'INVALID_INPUT',
      message: 'contextKey is required and must be a non-empty string',
      field: 'contextKey'
    };
  }
  
  if (typeof contextKey !== 'string') {
    return {
      error: 'TYPE_ERROR',
      message: 'contextKey must be a string',
      field: 'contextKey'
    };
  }
  
  if (contextKey === '') {
    return {
      error: 'INVALID_INPUT',
      message: 'contextKey is required and must be a non-empty string',
      field: 'contextKey'
    };
  }
  
  // Validate salt
  if (salt === null || salt === undefined) {
    return {
      error: 'INVALID_INPUT',
      message: 'salt is required and must be a string',
      field: 'salt'
    };
  }
  
  if (typeof salt !== 'string') {
    return {
      error: 'TYPE_ERROR',
      message: 'salt must be a string',
      field: 'salt'
    };
  }
  
  // All validations passed
  return null;
}
