<?php

namespace LaunchDarkly\HashValueExposer;

/**
 * Hash calculation layer for LaunchDarkly bucketing
 * Calculates hash values from flag components and normalizes to bucket values
 * 
 * LaunchDarkly uses SHA-1 hashing, not MurmurHash3
 */
class CalculateHashValue
{
    /**
     * Calculates hash and bucket value for flag evaluation
     * 
     * @param string $flagKey Feature flag key
     * @param string $contextKey User/context identifier
     * @param string $salt Salt value for hash
     * @return array ['hashValue' => int, 'bucketValue' => float]
     */
    public static function calculate(string $flagKey, string $contextKey, string $salt): array
    {
        // LaunchDarkly's bucketing algorithm: {flagKey}.{salt}.{contextKey}
        $hashKey = "{$flagKey}.{$salt}.{$contextKey}";
        
        // Calculate SHA-1 hash
        $sha1Hash = sha1($hashKey);
        
        // Extract first 15 hex characters (60 bits) as per LaunchDarkly's algorithm
        $hashPrefix = substr($sha1Hash, 0, 15);
        
        // Convert to GMP number for precise large integer handling
        $hashGmp = gmp_init($hashPrefix, 16);
        $divisorGmp = gmp_init('FFFFFFFFFFFFFFF', 16); // 2^60 - 1
        
        // Divide using GMP and convert to float
        $bucketValue = gmp_div($hashGmp, $divisorGmp);
        $bucketValue = (float)gmp_strval($hashGmp) / (float)gmp_strval($divisorGmp);
        
        // For display, convert hash to string representation
        $hashValue = gmp_strval($hashGmp);
        
        // Return array with hashValue and bucketValue
        return [
            'hashValue' => $hashValue,
            'bucketValue' => $bucketValue
        ];
    }
}
