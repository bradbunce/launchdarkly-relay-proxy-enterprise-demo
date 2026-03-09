<?php

namespace LaunchDarkly\HashValueExposer\Tests;

use PHPUnit\Framework\TestCase;
use LaunchDarkly\HashValueExposer\Validator;

/**
 * Unit tests for Validator class
 * Tests validation error messages and error structure
 */
class ValidatorTest extends TestCase
{
    /**
     * @test
     */
    public function testValidInputsReturnNull(): void
    {
        $result = Validator::validateInputs('flag-key', 'user-123', 'salt-value');
        $this->assertNull($result);
    }
    
    /**
     * @test
     */
    public function testValidInputsWithEmptySaltReturnNull(): void
    {
        $result = Validator::validateInputs('flag-key', 'user-123', '');
        $this->assertNull($result);
    }
    
    /**
     * @test
     */
    public function testNullFlagKeyReturnsError(): void
    {
        $result = Validator::validateInputs(null, 'user-123', 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('INVALID_INPUT', $result['error']);
        $this->assertEquals('flagKey is required and must be a non-empty string', $result['message']);
        $this->assertEquals('flagKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testEmptyFlagKeyReturnsError(): void
    {
        $result = Validator::validateInputs('', 'user-123', 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('INVALID_INPUT', $result['error']);
        $this->assertEquals('flagKey is required and must be a non-empty string', $result['message']);
        $this->assertEquals('flagKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testNonStringFlagKeyReturnsTypeError(): void
    {
        $result = Validator::validateInputs(123, 'user-123', 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('flagKey must be a string', $result['message']);
        $this->assertEquals('flagKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testArrayFlagKeyReturnsTypeError(): void
    {
        $result = Validator::validateInputs(['flag'], 'user-123', 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('flagKey must be a string', $result['message']);
        $this->assertEquals('flagKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testNullContextKeyReturnsError(): void
    {
        $result = Validator::validateInputs('flag-key', null, 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('INVALID_INPUT', $result['error']);
        $this->assertEquals('contextKey is required and must be a non-empty string', $result['message']);
        $this->assertEquals('contextKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testEmptyContextKeyReturnsError(): void
    {
        $result = Validator::validateInputs('flag-key', '', 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('INVALID_INPUT', $result['error']);
        $this->assertEquals('contextKey is required and must be a non-empty string', $result['message']);
        $this->assertEquals('contextKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testNonStringContextKeyReturnsTypeError(): void
    {
        $result = Validator::validateInputs('flag-key', 456, 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('contextKey must be a string', $result['message']);
        $this->assertEquals('contextKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testBooleanContextKeyReturnsTypeError(): void
    {
        $result = Validator::validateInputs('flag-key', true, 'salt');
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('contextKey must be a string', $result['message']);
        $this->assertEquals('contextKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testNullSaltReturnsError(): void
    {
        $result = Validator::validateInputs('flag-key', 'user-123', null);
        
        $this->assertIsArray($result);
        $this->assertEquals('INVALID_INPUT', $result['error']);
        $this->assertEquals('salt is required and must be a string', $result['message']);
        $this->assertEquals('salt', $result['field']);
    }
    
    /**
     * @test
     */
    public function testNonStringSaltReturnsTypeError(): void
    {
        $result = Validator::validateInputs('flag-key', 'user-123', 789);
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('salt must be a string', $result['message']);
        $this->assertEquals('salt', $result['field']);
    }
    
    /**
     * @test
     */
    public function testObjectSaltReturnsTypeError(): void
    {
        $result = Validator::validateInputs('flag-key', 'user-123', (object)['salt' => 'value']);
        
        $this->assertIsArray($result);
        $this->assertEquals('TYPE_ERROR', $result['error']);
        $this->assertEquals('salt must be a string', $result['message']);
        $this->assertEquals('salt', $result['field']);
    }
    
    /**
     * @test
     */
    public function testErrorStructureMatchesSpecification(): void
    {
        $result = Validator::validateInputs(null, 'user-123', 'salt');
        
        // Verify error structure has exactly the required fields
        $this->assertIsArray($result);
        $this->assertArrayHasKey('error', $result);
        $this->assertArrayHasKey('message', $result);
        $this->assertArrayHasKey('field', $result);
        $this->assertCount(3, $result);
    }
    
    /**
     * @test
     */
    public function testValidationStopsAtFirstError(): void
    {
        // If flagKey is invalid, should return flagKey error (not contextKey or salt)
        $result = Validator::validateInputs(null, null, null);
        
        $this->assertIsArray($result);
        $this->assertEquals('flagKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testValidationChecksContextKeyAfterFlagKey(): void
    {
        // If flagKey is valid but contextKey is invalid
        $result = Validator::validateInputs('flag-key', null, null);
        
        $this->assertIsArray($result);
        $this->assertEquals('contextKey', $result['field']);
    }
    
    /**
     * @test
     */
    public function testValidationChecksSaltAfterContextKey(): void
    {
        // If flagKey and contextKey are valid but salt is invalid
        $result = Validator::validateInputs('flag-key', 'user-123', null);
        
        $this->assertIsArray($result);
        $this->assertEquals('salt', $result['field']);
    }
    
    /**
     * @test
     */
    public function testValidInputsWithSpecialCharacters(): void
    {
        $result = Validator::validateInputs('flag!@#$', 'user-123', 'salt*&^');
        $this->assertNull($result);
    }
    
    /**
     * @test
     */
    public function testValidInputsWithUnicodeCharacters(): void
    {
        $result = Validator::validateInputs('flag-🌍', 'user-你好', 'salt-مرحبا');
        $this->assertNull($result);
    }
}
