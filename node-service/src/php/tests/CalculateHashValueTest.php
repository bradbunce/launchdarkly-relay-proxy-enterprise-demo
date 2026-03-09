<?php

namespace LaunchDarkly\HashValueExposer\Tests;

use PHPUnit\Framework\TestCase;
use LaunchDarkly\HashValueExposer\CalculateHashValue;

/**
 * Unit tests for CalculateHashValue implementation
 * Feature: hash-value-exposure
 */
class CalculateHashValueTest extends TestCase
{
    /**
     * Test with empty salt
     * 
     * @test
     */
    public function testWithEmptySalt(): void
    {
        /**
         * Validates: Requirements 8.4
         * 
         * The system should handle empty salt strings correctly.
         */
        $result = CalculateHashValue::calculate('feature-flag', 'user-456', '');
        
        // Verify result structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
        
        // Verify against known test vector
        $this->assertEquals(2096628055, $result['hashValue']);
        $this->assertEqualsWithDelta(0.28055, $result['bucketValue'], 0.000001);
    }
    
    /**
     * Test with Unicode characters (emoji)
     * 
     * @test
     */
    public function testWithUnicodeEmoji(): void
    {
        /**
         * Validates: Requirements 8.4
         * 
         * The system should handle Unicode characters including emoji correctly.
         */
        $result = CalculateHashValue::calculate('test-flag', 'user-🌍', 'salt');
        
        // Verify result structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
        
        // Verify against known test vector
        $this->assertEquals(-1395050361, $result['hashValue']);
        $this->assertEqualsWithDelta(0.50361, $result['bucketValue'], 0.000001);
    }
    
    /**
     * Test with Unicode characters (non-ASCII)
     * 
     * @test
     */
    public function testWithUnicodeNonAscii(): void
    {
        /**
         * Validates: Requirements 8.4
         * 
         * The system should handle non-ASCII Unicode characters correctly.
         */
        // Test with Chinese characters
        $result = CalculateHashValue::calculate('flag-中文', 'user-日本語', 'salt-한국어');
        
        // Verify result structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
    }
    
    /**
     * Test with special characters
     * 
     * @test
     */
    public function testWithSpecialCharacters(): void
    {
        /**
         * Validates: Requirements 8.4
         * 
         * The system should handle special characters correctly.
         */
        $result = CalculateHashValue::calculate('flag!@#', 'user$%^', 'salt&*()');
        
        // Verify result structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
        
        // Verify against known test vector
        $this->assertEquals(-1231920086, $result['hashValue']);
        $this->assertEqualsWithDelta(0.20086, $result['bucketValue'], 0.000001);
    }
    
    /**
     * Test with long keys
     * 
     * @test
     */
    public function testWithLongKeys(): void
    {
        /**
         * Validates: Requirements 8.4
         * 
         * The system should handle long input strings correctly.
         */
        $result = CalculateHashValue::calculate(
            'very-long-flag-key-with-many-characters',
            'very-long-context-key-with-many-characters',
            'very-long-salt-with-many-characters'
        );
        
        // Verify result structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
        
        // Verify bucket value is in valid range
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
        
        // Verify against known test vector
        $this->assertEquals(-288465383, $result['hashValue']);
        $this->assertEqualsWithDelta(0.65383, $result['bucketValue'], 0.000001);
    }
    
    /**
     * Test concatenation order
     * 
     * @test
     */
    public function testConcatenationOrder(): void
    {
        /**
         * Validates: Requirements 2.1
         * 
         * The system should concatenate inputs in the correct order: {flagKey}.{salt}.{contextKey}
         */
        $result = CalculateHashValue::calculate('my-flag', 'user-123', 'salt-value');
        
        // Verify against known test vector
        $this->assertEquals(-2112136673, $result['hashValue']);
        $this->assertEqualsWithDelta(0.36673, $result['bucketValue'], 0.000001);
        
        // Verify that different orders produce different results
        $result2 = CalculateHashValue::calculate('my-flag', 'salt-value', 'user-123');
        $this->assertNotEquals($result['hashValue'], $result2['hashValue']);
    }
    
    /**
     * Test result structure
     * 
     * @test
     */
    public function testResultStructure(): void
    {
        /**
         * Validates: Requirements 4.2
         * 
         * The result should contain both hashValue and bucketValue.
         */
        $result = CalculateHashValue::calculate('flag', 'user', 'salt');
        
        // Verify result is an array
        $this->assertIsArray($result);
        
        // Verify required keys exist
        $this->assertArrayHasKey('hashValue', $result);
        $this->assertArrayHasKey('bucketValue', $result);
        
        // Verify only expected keys exist
        $this->assertCount(2, $result);
        
        // Verify types
        $this->assertIsInt($result['hashValue']);
        $this->assertIsFloat($result['bucketValue']);
    }
    
    /**
     * Test negative hash values
     * 
     * @test
     */
    public function testNegativeHashValues(): void
    {
        /**
         * Validates: Requirements 3.4
         * 
         * The system should handle negative hash values correctly using abs().
         */
        // Use a known input that produces a negative hash
        $result = CalculateHashValue::calculate('my-flag', 'user-123', 'salt-value');
        
        // Verify hash is negative
        $this->assertLessThan(0, $result['hashValue']);
        
        // Verify bucket value is still in valid range [0, 1)
        $this->assertGreaterThanOrEqual(0, $result['bucketValue']);
        $this->assertLessThan(1, $result['bucketValue']);
        
        // Verify bucket value calculation with abs()
        $expectedBucketValue = (abs($result['hashValue']) % 100000) / 100000.0;
        $this->assertEquals($expectedBucketValue, $result['bucketValue']);
    }
}
