<?php

namespace LaunchDarkly\HashValueExposer\Tests;

use PHPUnit\Framework\TestCase;
use LaunchDarkly\HashValueExposer\Logger;

/**
 * Unit tests for Logger class
 * Feature: hash-value-exposure
 * 
 * Validates: Requirements 6.2, 6.3
 */
class LoggerTest extends TestCase
{
    /**
     * Test that logHashValue outputs all required fields
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that the log output contains all five required fields:
     * flagKey, contextKey, salt, hashValue, and bucketValue
     */
    public function testLogHashValueContainsAllFields(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt',
            'hashValue' => 12345,
            'bucketValue' => 0.12345
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Combine all log output into a single string
        $fullLog = implode("\n", $logOutput);
        
        // Verify all required fields are present
        $this->assertStringContainsString('[LaunchDarkly Hash Exposure]', $fullLog);
        $this->assertStringContainsString('Flag Key: test-flag', $fullLog);
        $this->assertStringContainsString('Context Key: user-123', $fullLog);
        $this->assertStringContainsString('Salt: my-salt', $fullLog);
        $this->assertStringContainsString('Hash Value: 12345', $fullLog);
        $this->assertStringContainsString('Bucket Value: 0.12345', $fullLog);
    }
    
    /**
     * Test that logHashValue handles empty salt
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that logging works correctly with empty salt
     */
    public function testLogHashValueHandlesEmptySalt(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => '',
            'hashValue' => 54321,
            'bucketValue' => 0.54321
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Combine all log output
        $fullLog = implode("\n", $logOutput);
        
        // Verify empty salt is logged
        $this->assertStringContainsString('Salt: ', $fullLog);
        $this->assertStringContainsString('Flag Key: test-flag', $fullLog);
    }
    
    /**
     * Test that logHashValue handles Unicode characters
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that logging works correctly with Unicode characters
     */
    public function testLogHashValueHandlesUnicodeCharacters(): void
    {
        $result = [
            'flagKey' => 'test-flag-🚀',
            'contextKey' => 'user-你好',
            'salt' => 'salt-مرحبا',
            'hashValue' => 99999,
            'bucketValue' => 0.99999
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Combine all log output
        $fullLog = implode("\n", $logOutput);
        
        // Verify Unicode characters are logged correctly
        $this->assertStringContainsString('test-flag-🚀', $fullLog);
        $this->assertStringContainsString('user-你好', $fullLog);
        $this->assertStringContainsString('salt-مرحبا', $fullLog);
    }
    
    /**
     * Test that logHashValue handles negative hash values
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that logging works correctly with negative hash values
     */
    public function testLogHashValueHandlesNegativeHashValues(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt',
            'hashValue' => -12345,
            'bucketValue' => 0.12345
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Combine all log output
        $fullLog = implode("\n", $logOutput);
        
        // Verify negative hash value is logged
        $this->assertStringContainsString('Hash Value: -12345', $fullLog);
    }
    
    /**
     * Test that logHashValue can use custom logger function
     * 
     * Validates: Requirements 6.3
     * 
     * Verifies that logging can be configured with a custom logger function
     */
    public function testLogHashValueUsesCustomLogger(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt',
            'hashValue' => 12345,
            'bucketValue' => 0.12345
        ];
        
        // Track if custom logger was called
        $customLoggerCalled = false;
        $callCount = 0;
        
        $customLogger = function($message) use (&$customLoggerCalled, &$callCount) {
            $customLoggerCalled = true;
            $callCount++;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Verify custom logger was called
        $this->assertTrue($customLoggerCalled);
        // Should be called 6 times (header + 5 fields)
        $this->assertEquals(6, $callCount);
    }
    
    /**
     * Test that logHashValue uses error_log by default
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that logging uses error_log when no custom logger is provided
     * Note: This test verifies the function executes without error when using default logger
     */
    public function testLogHashValueUsesDefaultLogger(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt',
            'hashValue' => 12345,
            'bucketValue' => 0.12345
        ];
        
        // Call logHashValue without custom logger (uses error_log)
        // This should not throw any exceptions
        Logger::logHashValue($result);
        
        // If we get here without exception, the test passes
        $this->assertTrue(true);
    }
    
    /**
     * Test that logHashValue output format matches Node.js implementation
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that the log format matches the Node.js logger format
     */
    public function testLogHashValueFormatMatchesNodeJs(): void
    {
        $result = [
            'flagKey' => 'test-flag',
            'contextKey' => 'user-123',
            'salt' => 'my-salt',
            'hashValue' => 12345,
            'bucketValue' => 0.12345
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Verify exact format matches Node.js
        $this->assertEquals('[LaunchDarkly Hash Exposure]', $logOutput[0]);
        $this->assertEquals('Flag Key: test-flag', $logOutput[1]);
        $this->assertEquals('Context Key: user-123', $logOutput[2]);
        $this->assertEquals('Salt: my-salt', $logOutput[3]);
        $this->assertEquals('Hash Value: 12345', $logOutput[4]);
        $this->assertEquals('Bucket Value: 0.12345', $logOutput[5]);
    }
    
    /**
     * Test that logHashValue handles very long strings
     * 
     * Validates: Requirements 6.2
     * 
     * Verifies that logging works correctly with very long input strings
     */
    public function testLogHashValueHandlesLongStrings(): void
    {
        $longString = str_repeat('a', 1000);
        
        $result = [
            'flagKey' => $longString,
            'contextKey' => $longString,
            'salt' => $longString,
            'hashValue' => 12345,
            'bucketValue' => 0.12345
        ];
        
        // Capture log output
        $logOutput = [];
        $customLogger = function($message) use (&$logOutput) {
            $logOutput[] = $message;
        };
        
        // Call logHashValue with custom logger
        Logger::logHashValue($result, $customLogger);
        
        // Verify all fields are present
        $this->assertCount(6, $logOutput);
        $this->assertStringContainsString($longString, $logOutput[1]);
    }
}
