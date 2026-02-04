<?php

namespace LaunchDarkly\HashValueExposer;

/**
 * Input validation class for hash value exposure
 * Validates inputs and provides descriptive error messages
 */
class Validator
{
    /**
     * Validates inputs for hash calculation
     * 
     * @param mixed $flagKey Feature flag key
     * @param mixed $contextKey User/context identifier
     * @param mixed $salt Salt value for hash
     * @return array|null Error array if validation fails, null if valid
     */
    public static function validateInputs($flagKey, $contextKey, $salt): ?array
    {
        // Validate flagKey
        if ($flagKey === null) {
            return [
                'error' => 'INVALID_INPUT',
                'message' => 'flagKey is required and must be a non-empty string',
                'field' => 'flagKey'
            ];
        }
        
        if (!is_string($flagKey)) {
            return [
                'error' => 'TYPE_ERROR',
                'message' => 'flagKey must be a string',
                'field' => 'flagKey'
            ];
        }
        
        if ($flagKey === '') {
            return [
                'error' => 'INVALID_INPUT',
                'message' => 'flagKey is required and must be a non-empty string',
                'field' => 'flagKey'
            ];
        }
        
        // Validate contextKey
        if ($contextKey === null) {
            return [
                'error' => 'INVALID_INPUT',
                'message' => 'contextKey is required and must be a non-empty string',
                'field' => 'contextKey'
            ];
        }
        
        if (!is_string($contextKey)) {
            return [
                'error' => 'TYPE_ERROR',
                'message' => 'contextKey must be a string',
                'field' => 'contextKey'
            ];
        }
        
        if ($contextKey === '') {
            return [
                'error' => 'INVALID_INPUT',
                'message' => 'contextKey is required and must be a non-empty string',
                'field' => 'contextKey'
            ];
        }
        
        // Validate salt
        if ($salt === null) {
            return [
                'error' => 'INVALID_INPUT',
                'message' => 'salt is required and must be a string',
                'field' => 'salt'
            ];
        }
        
        if (!is_string($salt)) {
            return [
                'error' => 'TYPE_ERROR',
                'message' => 'salt must be a string',
                'field' => 'salt'
            ];
        }
        
        // All validations passed
        return null;
    }
}
