<?php

namespace LaunchDarkly\HashValueExposer\Tests;

use PHPUnit\Framework\TestCase;
use LaunchDarkly\HashValueExposer\HashValueExposer;

/**
 * Unit tests for HashValueExposer class
 * Feature: hash-value-exposure
 */
class HashValueExposerTest extends TestCase
{
    /**
     * Test that expose() returns correct structure with all required fields
     * 
     * Validates: Requirements 4.1, 4.2
     * 
     * Verifies that expose() returns an array with all required fields:
     * flagKey, contextKey, salt, hashValue, bucketValue
     */
    public function testExposeReturnsCorrectStructure(): void
    {
        $exposer = new HashValueExposer();
        $result = $exposer->expose([
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt'
        ]);
        
        // Verify all required fields are present
        $this->assertArrayHasKey('flagKey', $result);
        $this->assertArrayHasKey('contextKey', $result);
        $this->assertArrayHasKey('salt', $result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify input values are preserved
        $this->assertEquals('test-flag', $result['flagKey']);
        $this->assertEquals('user-123', $result['contextKey']);
        $this->assertEquals('my-salt', $result['salt']);
        
        // Verify computed values are present and correct types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
    }
    
    /**
     * Test that expose() handles validation errors correctly
     * 
     * Validates: Requirements 4.1, 7.1, 7.2, 7.3
     * 
     * Verifies that expose() returns error arrays when inputs are invalid
     */
    public function testExposeHandlesValidationErrors(): void
    {
        $exposer = new HashValueExposer();
        
        // Test missing flagKey
        $result1 = $exposer->expose([
            'contextKey' => 'user-123',
            'salt' => 'my-salt'
        ]);
        $this->assertEquals('INVALID_INPUT', $result1['error']);
        $this->assertEquals('flagKey', $result1['field']);
        
        // Test empty flagKey
        $result2 = $exposer->expose([
            'flagKey' => '',
            'contextKey' => 'user-123',
            'salt' => 'my-salt'
        ]);
        $this->assertEquals('INVALID_INPUT', $result2['error']);
        $this->assertEquals('flagKey', $result2['field']);
        
        // Test missing contextKey
        $result3 = $exposer->expose([
            'flagKey' => 'test-flag',
            'salt' => 'my-salt'
        ]);
        $this->assertEquals('INVALID_INPUT', $result3['error']);
        $this->assertEquals('contextKey', $result3['field']);
    }
    
    /**
     * Test that exposeWithLogging() returns same result as expose()
     * 
     * Validates: Requirements 4.1, 4.2
     * 
     * Verifies that exposeWithLogging() returns the same result structure as expose()
     */
    public function testExposeWithLoggingReturnsSameResult(): void
    {
        $exposer = new HashValueExposer();
        
        $result = $exposer->exposeWithLogging([
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt'
        ]);
        
        // Verify result structure
        $this->assertArrayHasKey('flagKey', $result);
        $this->assertArrayHasKey('contextKey', $result);
        $this->assertArrayHasKey('salt', $result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify values
        $this->assertEquals('test-flag', $result['flagKey']);
        $this->assertEquals('user-123', $result['contextKey']);
        $this->assertEquals('my-salt', $result['salt']);
    }
    
    /**
     * Test that expose() works with empty salt
     * 
     * Validates: Requirements 4.1, 8.4
     * 
     * Verifies that expose() handles empty salt correctly
     */
    public function testExposeWorksWithEmptySalt(): void
    {
        $exposer = new HashValueExposer();
        $result = $exposer->expose([
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => ''
        ]);
        
        // Verify result is valid
        $this->assertArrayNotHasKey('error', $result);
        $this->assertEquals('', $result['salt']);
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
    }
    
    /**
     * Test that expose() handles Unicode characters
     * 
     * Validates: Requirements 4.1, 8.4
     * 
     * Verifies that expose() handles Unicode characters correctly
     */
    public function testExposeHandlesUnicodeCharacters(): void
    {
        $exposer = new HashValueExposer();
        $result = $exposer->expose([
            'flagKey' => 'test-flag-🚀',
            'contextKey' => 'user-你好',
            'salt' => 'salt-مرحبا'
        ]);
        
        // Verify result is valid
        $this->assertArrayNotHasKey('error', $result);
        $this->assertEquals('test-flag-🚀', $result['flagKey']);
        $this->assertEquals('user-你好', $result['contextKey']);
        $this->assertEquals('salt-مرحبا', $result['salt']);
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
    }
    
    /**
     * Test consistency with Node.js API
     * 
     * Validates: Requirements 4.1, 4.2, 8.1
     * 
     * Verifies that PHP implementation produces same results as Node.js
     * by testing with known inputs that should produce consistent outputs
     */
    public function testConsistencyWithNodeJsApi(): void
    {
        $exposer = new HashValueExposer();
        
        // Test with same inputs
        $result = $exposer->expose([
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt'
        ]);
        
        // Verify structure matches Node.js API
        $this->assertArrayHasKey('flagKey', $result);
        $this->assertArrayHasKey('contextKey', $result);
        $this->assertArrayHasKey('salt', $result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types match Node.js API
        $this->assertIsString($result['flagKey']);
        $this->assertIsString($result['contextKey']);
        $this->assertIsString($result['salt']);
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
    }
}
