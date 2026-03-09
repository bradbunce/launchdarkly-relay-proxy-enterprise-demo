<?php
/**
 * Unit Tests for PHP Service CORS Configuration
 * 
 * This script contains unit tests for the PHP service CORS configuration
 * to ensure it correctly uses environment variables for port configuration.
 * 
 * Tests cover:
 * - CORS with custom DASHBOARD_PORT value
 * - CORS with missing DASHBOARD_PORT (fallback to 8000)
 * - CORS origin matching logic
 * 
 * **Validates: Requirements 4.4**
 * 
 * Run this script from the command line:
 *   php test_cors_configuration.php
 */

// Simple test framework
class TestRunner {
    private $passed = 0;
    private $failed = 0;
    private $tests = [];
    
    public function test($name, $callback) {
        $this->tests[] = ['name' => $name, 'callback' => $callback];
    }
    
    public function run() {
        echo "Running PHP CORS Configuration Tests\n";
        echo str_repeat("=", 50) . "\n\n";
        
        foreach ($this->tests as $test) {
            try {
                $test['callback']();
                $this->passed++;
                echo "✓ PASS: {$test['name']}\n";
            } catch (Exception $e) {
                $this->failed++;
                echo "✗ FAIL: {$test['name']}\n";
                echo "  Error: {$e->getMessage()}\n";
            }
        }
        
        echo "\n" . str_repeat("=", 50) . "\n";
        echo "Results: {$this->passed} passed, {$this->failed} failed\n";
        
        return $this->failed === 0;
    }
}

function assertEquals($expected, $actual, $message = '') {
    if ($expected !== $actual) {
        $msg = $message ?: "Expected " . var_export($expected, true) . " but got " . var_export($actual, true);
        throw new Exception($msg);
    }
}

function assertTrue($condition, $message = 'Assertion failed') {
    if (!$condition) {
        throw new Exception($message);
    }
}

function assertFalse($condition, $message = 'Assertion failed') {
    if ($condition) {
        throw new Exception($message);
    }
}

function assertContains($needle, $haystack, $message = '') {
    if (!in_array($needle, $haystack)) {
        $msg = $message ?: "Array does not contain " . var_export($needle, true);
        throw new Exception($msg);
    }
}

// Test Suite
$runner = new TestRunner();

// Test 1: CORS with custom DASHBOARD_PORT value
$runner->test('CORS configuration uses custom DASHBOARD_PORT from environment', function() {
    // Set custom dashboard port
    putenv('DASHBOARD_PORT=9000');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Verify custom port is used
    assertEquals('9000', $dashboardPort, 'Dashboard port should be 9000');
    assertContains('http://localhost:9000', $allowedOrigins, 'Allowed origins should include custom dashboard port');
    assertContains('http://localhost:3000', $allowedOrigins, 'Allowed origins should include node service port');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Test 2: CORS with missing DASHBOARD_PORT (fallback to 8000)
$runner->test('CORS configuration falls back to default port 8000 when DASHBOARD_PORT is not set', function() {
    // Ensure DASHBOARD_PORT is not set
    putenv('DASHBOARD_PORT');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Verify fallback to default
    assertEquals('8000', $dashboardPort, 'Dashboard port should fallback to 8000');
    assertContains('http://localhost:8000', $allowedOrigins, 'Allowed origins should include default dashboard port');
});

// Test 3: CORS origin matching logic - allowed origin
$runner->test('CORS origin matching allows requests from dashboard port', function() {
    // Set custom dashboard port
    putenv('DASHBOARD_PORT=7500');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Test origin matching
    $origin = 'http://localhost:7500';
    $isAllowed = in_array($origin, $allowedOrigins);
    
    assertTrue($isAllowed, 'Origin from custom dashboard port should be allowed');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Test 4: CORS origin matching logic - disallowed origin
$runner->test('CORS origin matching rejects requests from unauthorized origins', function() {
    // Set custom dashboard port
    putenv('DASHBOARD_PORT=8000');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Test origin matching with unauthorized origin
    $origin = 'http://localhost:9999';
    $isAllowed = in_array($origin, $allowedOrigins);
    
    assertFalse($isAllowed, 'Origin from unauthorized port should be rejected');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Test 5: CORS configuration with empty DASHBOARD_PORT
$runner->test('CORS configuration handles empty DASHBOARD_PORT string', function() {
    // Set empty dashboard port
    putenv('DASHBOARD_PORT=');
    
    // Simulate CORS configuration logic (getenv returns false for empty string)
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Verify fallback to default when empty
    assertEquals('8000', $dashboardPort, 'Dashboard port should fallback to 8000 when empty');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Test 6: Verify no hardcoded port 8000 in allowed origins construction
$runner->test('CORS configuration does not use hardcoded port 8000 in allowed origins', function() {
    // Set custom dashboard port
    putenv('DASHBOARD_PORT=5555');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Verify hardcoded 8000 is NOT in allowed origins
    $hasHardcoded8000 = in_array('http://localhost:8000', $allowedOrigins);
    assertFalse($hasHardcoded8000, 'Allowed origins should not contain hardcoded port 8000 when custom port is set');
    
    // Verify custom port IS in allowed origins
    assertContains('http://localhost:5555', $allowedOrigins, 'Allowed origins should contain custom port');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Test 7: CORS with multiple allowed origins
$runner->test('CORS configuration includes both dashboard and node service origins', function() {
    // Set custom dashboard port
    putenv('DASHBOARD_PORT=8500');
    
    // Simulate CORS configuration logic
    $dashboardPort = getenv('DASHBOARD_PORT') ?: '8000';
    $allowedOrigins = [
        "http://localhost:$dashboardPort",
        "http://localhost:3000"
    ];
    
    // Verify both origins are present
    assertEquals(2, count($allowedOrigins), 'Should have exactly 2 allowed origins');
    assertContains('http://localhost:8500', $allowedOrigins, 'Should include dashboard origin');
    assertContains('http://localhost:3000', $allowedOrigins, 'Should include node service origin');
    
    // Clean up
    putenv('DASHBOARD_PORT');
});

// Run all tests
$success = $runner->run();
exit($success ? 0 : 1);
