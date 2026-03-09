<?php

namespace LaunchDarkly\HashValueExposer;

/**
 * Logger class for LaunchDarkly Hash Value Exposure
 * Formats and outputs hash values for demonstrations
 * 
 * Requirements: 6.1, 6.2
 */
class Logger
{
    /**
     * Logs hash value results in a human-readable format
     * 
     * @param array $result Result array containing hash information
     *                      - flagKey: Feature flag key
     *                      - contextKey: User/context identifier
     *                      - salt: Salt value
     *                      - hashValue: Raw 32-bit hash value
     *                      - bucketValue: Normalized bucket value [0, 1)
     * @param callable|null $logFunction Optional custom log function (default: error_log)
     */
    public static function logHashValue(array $result, ?callable $logFunction = null): void
    {
        // Use error_log by default, or custom function if provided
        $log = $logFunction ?? function($message) {
            error_log($message);
        };
        
        $log('[LaunchDarkly Hash Exposure]');
        $log("Flag Key: {$result['flagKey']}");
        $log("Context Key: {$result['contextKey']}");
        $log("Salt: {$result['salt']}");
        $log("Hash Value: {$result['hashValue']}");
        $log("Bucket Value: {$result['bucketValue']}");
    }
}
