<?php

namespace LaunchDarkly\HashValueExposer\Tests;

use PHPUnit\Framework\TestCase;
use LaunchDarkly\HashValueExposer\MurmurHash3;

/**
 * Unit tests for MurmurHash3 implementation
 * Tests against known test vectors and edge cases
 */
class MurmurHash3Test extends TestCase
{
    /**
     * @test
     */
    public function testEmptyStringWithSeed0ShouldReturn0(): void
    {
        $hash = MurmurHash3::hash('', 0);
        $this->assertEquals(0, $hash);
    }
    
    /**
     * @test
     */
    public function testSingleCharacterA(): void
    {
        $hash = MurmurHash3::hash('a', 0);
        
        // Verify it returns a valid 32-bit integer
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testSimpleStringHello(): void
    {
        $hash = MurmurHash3::hash('hello', 0);
        
        // Verify it returns a valid 32-bit integer
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testLaunchDarklyStyleConcatenation(): void
    {
        $hash = MurmurHash3::hash('flag-key.salt.user-123', 0);
        
        // Verify it returns a valid 32-bit integer
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testLongString(): void
    {
        $longString = 'this-is-a-very-long-string-that-tests-multiple-blocks-in-the-hash-algorithm-implementation';
        $hash = MurmurHash3::hash($longString, 0);
        
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testUnicodeCharactersEmoji(): void
    {
        $hash = MurmurHash3::hash('hello🌍world', 0);
        
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testSpecialCharacters(): void
    {
        $hash = MurmurHash3::hash('flag!@#$%^&*()_+-=[]{}|;:\',.<>?', 0);
        
        $this->assertIsInt($hash);
        $this->assertGreaterThanOrEqual(-2147483648, $hash);
        $this->assertLessThanOrEqual(2147483647, $hash);
    }
    
    /**
     * @test
     */
    public function testNonZeroSeedProducesDifferentHash(): void
    {
        $input = 'test';
        $hash1 = MurmurHash3::hash($input, 0);
        $hash2 = MurmurHash3::hash($input, 42);
        
        $this->assertNotEquals($hash1, $hash2);
    }
    
    /**
     * @test
     */
    public function testSameInputProducesSameHashDeterministic(): void
    {
        $input = 'consistent-test';
        $hash1 = MurmurHash3::hash($input, 0);
        $hash2 = MurmurHash3::hash($input, 0);
        
        $this->assertEquals($hash1, $hash2);
    }
    
    /**
     * @test
     */
    public function testStringLengthVariations(): void
    {
        // 1-byte string
        $hash = MurmurHash3::hash('x', 0);
        $this->assertIsInt($hash);
        
        // 2-byte string
        $hash = MurmurHash3::hash('xy', 0);
        $this->assertIsInt($hash);
        
        // 3-byte string
        $hash = MurmurHash3::hash('xyz', 0);
        $this->assertIsInt($hash);
        
        // 4-byte string (exactly one block)
        $hash = MurmurHash3::hash('abcd', 0);
        $this->assertIsInt($hash);
        
        // 5-byte string (one block + 1 byte)
        $hash = MurmurHash3::hash('abcde', 0);
        $this->assertIsInt($hash);
        
        // 8-byte string (exactly two blocks)
        $hash = MurmurHash3::hash('abcdefgh', 0);
        $this->assertIsInt($hash);
    }
    
    /**
     * @test
     */
    public function testAgainstSharedTestVectors(): void
    {
        // Load test vectors from shared JSON file
        $testVectorsPath = __DIR__ . '/../../../test-vectors.json';
        $this->assertFileExists($testVectorsPath, 'Test vectors file must exist');
        
        $testVectorsJson = file_get_contents($testVectorsPath);
        $testVectors = json_decode($testVectorsJson, true);
        
        $this->assertIsArray($testVectors);
        $this->assertArrayHasKey('vectors', $testVectors);
        
        // Test against all known vectors
        foreach ($testVectors['vectors'] as $vector) {
            // Skip vectors without expected hash (not yet filled)
            if ($vector['expectedHash'] === null) {
                continue;
            }
            
            $input = $vector['input'];
            $seed = $vector['seed'];
            $expectedHash = $vector['expectedHash'];
            
            $actualHash = MurmurHash3::hash($input, $seed);
            
            $this->assertEquals(
                $expectedHash,
                $actualHash,
                sprintf(
                    'Hash mismatch for "%s" (input: "%s", seed: %d)',
                    $vector['description'],
                    $input,
                    $seed
                )
            );
        }
    }
}
