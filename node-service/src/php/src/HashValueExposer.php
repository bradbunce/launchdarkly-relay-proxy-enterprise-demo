<?php

namespace LaunchDarkly\HashValueExposer;

/**
 * HashValueExposer API for LaunchDarkly bucketing
 * Provides the main public API for exposing hash values
 */
class HashValueExposer
{
    /**
     * Exposes hash value for a flag evaluation
     * 
     * @param array $options Configuration options
     *                       - flagKey: Feature flag key
     *                       - contextKey: User/context identifier
     *                       - salt: Salt value
     * @return array ['hashValue', 'bucketValue', 'flagKey', 'contextKey', 'salt'] or error array
     */
    public function expose(array $options): array
    {
        // Extract parameters from options
        $flagKey = $options['flagKey'] ?? null;
        $contextKey = $options['contextKey'] ?? null;
        $salt = $options['salt'] ?? null;
        
        // Validate inputs
        $validationError = Validator::validateInputs($flagKey, $contextKey, $salt);
        
        // If validation failed, return error
        if ($validationError !== null) {
            return $validationError;
        }
        
        // Calculate hash value
        $result = CalculateHashValue::calculate($flagKey, $contextKey, $salt);
        
        // Return result array with all required fields
        return [
            'flagKey' => $flagKey,
            'contextKey' => $contextKey,
            'salt' => $salt,
            'hashValue' => $result['hashValue'],
            'bucketValue' => $result['bucketValue']
        ];
    }
    
    /**
     * Exposes hash value with logging
     * 
     * @param array $options Same as expose()
     * @return array Same as expose()
     */
    public function exposeWithLogging(array $options): array
    {
        // Call expose to get the result
        $result = $this->expose($options);
        
        // If result is an error, don't log
        if (isset($result['error'])) {
            return $result;
        }
        
        // Log the result using Logger class
        Logger::logHashValue($result);
        
        return $result;
    }
}
