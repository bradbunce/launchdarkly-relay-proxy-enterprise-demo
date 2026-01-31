<?php
/**
 * LaunchDarkly PHP SDK Daemon Mode Demo
 * 
 * This application demonstrates the LaunchDarkly PHP SDK in daemon mode,
 * reading feature flags from Redis without connecting to LaunchDarkly servers.
 */

// Suppress display errors but log them for debugging
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', '/tmp/php-errors.log');

require_once __DIR__ . '/vendor/autoload.php';

use LaunchDarkly\LDClient;
use LaunchDarkly\Integrations\Redis;

// Store current context for PHP service (dashboard)
session_start();
if (!isset($_SESSION['php_service_context'])) {
    $_SESSION['php_service_context'] = [
        'type' => 'anonymous',
        'key' => 'php-anon-' . uniqid(),
        'anonymous' => true
    ];
}

// Log file for streaming to UI
$logFile = '/tmp/php-app.log';

// Custom logging function
function log_message($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logLine = "[{$timestamp}] {$message}\n";
    file_put_contents($logFile, $logLine, FILE_APPEND);
    error_log($message); // Also log to stderr
}

// ===== INITIALIZE LAUNCHDARKLY SDK CLIENT (ONCE PER WORKER) =====
// Best practice: Create a single, shared instance of LDClient
// This client will be reused across all requests in this PHP-FPM worker process

$ldClient = null;
$ldClientError = null;

function getLDClient() {
    global $ldClient, $ldClientError;
    
    // Return cached client if already initialized
    if ($ldClient !== null) {
        return $ldClient;
    }
    
    // Return null if we previously failed to initialize
    if ($ldClientError !== null) {
        return null;
    }
    
    try {
        $sdkKey = getenv('LAUNCHDARKLY_SDK_KEY');
        $redisHost = getenv('REDIS_HOST') ?: 'redis';
        $redisPort = getenv('REDIS_PORT') ?: 6379;
        $redisPrefix = getenv('REDIS_PREFIX') ?: null;
        $relayProxyUrl = getenv('RELAY_PROXY_URL') ?: 'http://relay-proxy:8030';
        
        // Initialize Redis client
        $redisClient = new Predis\Client([
            'scheme' => 'tcp',
            'host' => $redisHost,
            'port' => (int)$redisPort
        ]);
        
        $options = $redisPrefix ? ['prefix' => $redisPrefix] : [];
        $featureStore = Redis::featureRequester($redisClient, $options);
        
        // Create single LDClient instance (best practice)
        $ldClient = new LDClient($sdkKey, [
            'feature_requester' => $featureStore,
            'send_events' => true,
            'base_uri' => $relayProxyUrl,
            'use_ldd' => false
        ]);
        
        log_message('LaunchDarkly SDK client initialized successfully');
        return $ldClient;
        
    } catch (Exception $e) {
        $ldClientError = $e->getMessage();
        log_message('Failed to initialize LaunchDarkly SDK: ' . $ldClientError);
        return null;
    }
}

// Helper function to build context from session
function buildContextFromSession() {
    $contextData = $_SESSION['php_service_context'];
    $contextBuilder = \LaunchDarkly\LDContext::builder($contextData['key']);
    $contextBuilder->kind('user');
    
    if (isset($contextData['name'])) {
        $contextBuilder->name($contextData['name']);
    }
    if (isset($contextData['email'])) {
        $contextBuilder->set('email', $contextData['email']);
    }
    if (isset($contextData['location'])) {
        $contextBuilder->set('location', $contextData['location']);
    }
    if (isset($contextData['anonymous'])) {
        $contextBuilder->set('anonymous', $contextData['anonymous']);
    }
    
    return $contextBuilder->build();
}

// Initialize the global client once when the script loads
// This ensures the client is ready for all API endpoints
getLDClient();

// Handle API endpoints for dashboard
$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// API: Update context
if ($requestUri === '/api/context' && $requestMethod === 'POST') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    
    if ($input['type'] === 'custom') {
        if (empty($input['email'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Email is required for custom context']);
            exit;
        }
        
        $_SESSION['php_service_context'] = [
            'type' => 'custom',
            'key' => $input['email'],
            'email' => $input['email'],
            'anonymous' => false
        ];
        
        if (!empty($input['name'])) {
            $_SESSION['php_service_context']['name'] = $input['name'];
        }
        if (!empty($input['location'])) {
            $_SESSION['php_service_context']['location'] = $input['location'];
        }
    } else {
        $_SESSION['php_service_context'] = [
            'type' => 'anonymous',
            'key' => 'php-anon-' . uniqid(),
            'anonymous' => true
        ];
        
        if (!empty($input['location'])) {
            $_SESSION['php_service_context']['location'] = $input['location'];
        }
    }
    
    // Trigger a flag evaluation to store the new context in Redis (daemon mode)
    try {
        $client = getLDClient();
        if ($client) {
            $context = buildContextFromSession();
            // Evaluate a flag to ensure the context is stored in Redis
            $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
            log_message("Context updated and stored in Redis: " . $context->getKey());
        }
    } catch (Exception $e) {
        log_message("Error storing context in Redis: " . $e->getMessage());
    }
    
    echo json_encode(['success' => true, 'context' => $_SESSION['php_service_context']]);
    exit;
}

// API: Get current context
if ($requestUri === '/api/context' && $requestMethod === 'GET') {
    header('Content-Type: application/json');
    
    try {
        // Ensure session context exists
        if (!isset($_SESSION['php_service_context'])) {
            $_SESSION['php_service_context'] = [
                'type' => 'anonymous',
                'key' => 'php-anon-' . uniqid(),
                'anonymous' => true
            ];
        }
        
        $context = $_SESSION['php_service_context'];
        
        echo json_encode([
            'type' => $context['type'],
            'key' => $context['key'] ?? 'php-anon-' . uniqid(),
            'email' => $context['email'] ?? null,
            'name' => $context['name'] ?? null,
            'location' => $context['location'] ?? null,
            'anonymous' => $context['anonymous'] ?? false
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        error_log('PHP context endpoint error: ' . $e->getMessage());
    }
    exit;
}

// API: Get status
if ($requestUri === '/api/status' && $requestMethod === 'GET') {
    header('Content-Type: application/json');
    
    // Use the global client to check status
    $client = getLDClient();
    $sdkConnected = ($client !== null);
    
    // Also check Redis connectivity
    $redisConnected = false;
    $redisError = null;
    
    if ($sdkConnected) {
        try {
            $redisHost = getenv('REDIS_HOST') ?: 'redis';
            $redisPort = getenv('REDIS_PORT') ?: 6379;
            
            $redisClient = new Predis\Client([
                'scheme' => 'tcp',
                'host' => $redisHost,
                'port' => (int)$redisPort
            ]);
            
            // Test Redis connection with ping
            $redisClient->ping();
            $redisConnected = true;
        } catch (Exception $e) {
            $redisError = $e->getMessage();
        }
    }
    
    // Overall connected status requires both SDK and Redis
    $connected = $sdkConnected && $redisConnected;
    
    echo json_encode([
        'connected' => $connected,
        'mode' => 'Daemon Mode (Redis + Events)',
        'sdkVersion' => 'PHP SDK',
        'sdkInitialized' => $sdkConnected,
        'redisConnected' => $redisConnected,
        'error' => !$connected ? ($redisError ?? $ldClientError ?? 'SDK or Redis unavailable') : null
    ]);
    exit;
}

// API: Test flag evaluation (for dashboard testing)
if ($requestUri === '/api/test-evaluation' && $requestMethod === 'POST') {
    header('Content-Type: application/json');
    
    try {
        // Use the global client
        $client = getLDClient();
        
        if (!$client) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => $ldClientError ?? 'SDK not initialized'
            ]);
            exit;
        }
        
        // Check if context is provided in request body (from dashboard)
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (isset($input['context'])) {
            // Use context from request body (sent by dashboard)
            $contextData = $input['context'];
            
            // Ensure we have a key - use session key if missing
            if (empty($contextData['key'])) {
                if (!empty($contextData['email'])) {
                    $contextData['key'] = $contextData['email'];
                } elseif (isset($_SESSION['php_service_context']['key'])) {
                    // Use the session's key to maintain consistency
                    $contextData['key'] = $_SESSION['php_service_context']['key'];
                } else {
                    $contextData['key'] = 'php-anon-' . uniqid();
                }
            }
            
            $contextBuilder = \LaunchDarkly\LDContext::builder($contextData['key']);
            $contextBuilder->kind('user');
            
            if (isset($contextData['name'])) {
                $contextBuilder->name($contextData['name']);
            }
            if (isset($contextData['email'])) {
                $contextBuilder->set('email', $contextData['email']);
            }
            if (isset($contextData['location'])) {
                $contextBuilder->set('location', $contextData['location']);
            }
            if (isset($contextData['anonymous'])) {
                $contextBuilder->set('anonymous', $contextData['anonymous']);
            }
            
            $context = $contextBuilder->build();
        } else {
            // Fallback to session context
            $context = buildContextFromSession();
            $contextData = $_SESSION['php_service_context'];
        }
        
        // Log context info
        log_message("=== Test Flag Evaluation ===");
        log_message("PHP SDK: Context Type: " . ($contextData['type'] ?? 'unknown'));
        log_message("PHP SDK: Context Key: " . $context->getKey());
        if (isset($contextData['name'])) {
            log_message("PHP SDK: Context Name: " . $contextData['name']);
        }
        if (isset($contextData['email'])) {
            log_message("PHP SDK: Context Email: " . $contextData['email']);
        }
        if (isset($contextData['location'])) {
            log_message("PHP SDK: Context Location: " . $contextData['location']);
        }
        log_message("PHP SDK: Context Anonymous: " . (($contextData['anonymous'] ?? false) ? 'true' : 'false'));
        
        // Evaluate flag
        log_message("PHP SDK: Evaluating flag 'user-message'");
        $flagValue = $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
        log_message("PHP SDK: Flag evaluation result: {$flagValue}");
        log_message("===========================");
        
        echo json_encode([
            'success' => true,
            'flagValue' => $flagValue,
            'context' => [
                'type' => $contextData['type'],
                'key' => $context->getKey(),
                'name' => $contextData['name'] ?? null,
                'email' => $contextData['email'] ?? null,
                'location' => $contextData['location'] ?? null,
                'anonymous' => $contextData['anonymous']
            ]
        ]);
    } catch (Exception $e) {
        log_message("PHP SDK ERROR during test evaluation: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}

// API: Get all flags state (SDK cache)
if ($requestUri === '/api/all-flags' && $requestMethod === 'POST') {
    header('Content-Type: application/json');
    
    try {
        // Use the global client
        $client = getLDClient();
        
        if (!$client) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => $ldClientError ?? 'SDK not initialized'
            ]);
            exit;
        }
        
        // Check if context is provided in request body (from dashboard)
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (isset($input['context'])) {
            // Use context from request body (sent by dashboard)
            $contextData = $input['context'];
            
            // Ensure we have a key - use session key if missing
            if (empty($contextData['key'])) {
                if (!empty($contextData['email'])) {
                    $contextData['key'] = $contextData['email'];
                } elseif (isset($_SESSION['php_service_context']['key'])) {
                    // Use the session's key to maintain consistency
                    $contextData['key'] = $_SESSION['php_service_context']['key'];
                } else {
                    $contextData['key'] = 'php-anon-' . uniqid();
                }
            }
            
            $contextBuilder = \LaunchDarkly\LDContext::builder($contextData['key']);
            $contextBuilder->kind('user');
            
            if (isset($contextData['name'])) {
                $contextBuilder->name($contextData['name']);
            }
            if (isset($contextData['email'])) {
                $contextBuilder->set('email', $contextData['email']);
            }
            if (isset($contextData['location'])) {
                $contextBuilder->set('location', $contextData['location']);
            }
            if (isset($contextData['anonymous'])) {
                $contextBuilder->set('anonymous', $contextData['anonymous']);
            }
            
            $context = $contextBuilder->build();
        } else {
            // Fallback to session context
            $context = buildContextFromSession();
            $contextData = $_SESSION['php_service_context'];
        }
        
        // Get all flags state
        $allFlagsState = $client->allFlagsState($context);
        $allFlags = $allFlagsState->toValuesMap();
        
        log_message("PHP SDK: All Flags request - Context key: " . $context->getKey());
        log_message("PHP SDK: All Flags - user-message value: " . ($allFlags['user-message'] ?? 'NOT FOUND'));
        
        echo json_encode([
            'success' => true,
            'flags' => $allFlags,
            'valid' => $allFlagsState->isValid(),
            'context' => [
                'type' => $contextData['type'],
                'key' => $context->getKey(),
                'email' => $contextData['email'] ?? null,
                'name' => $contextData['name'] ?? null,
                'location' => $contextData['location'] ?? null,
                'anonymous' => $contextData['anonymous'] ?? false
            ]
        ]);
    } catch (Exception $e) {
        log_message("PHP SDK ERROR getting all flags: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}

// API: Load test endpoint
if ($requestUri === '/api/load-test' && $requestMethod === 'POST') {
    header('Content-Type: application/json');
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $totalRequests = isset($input['requests']) ? (int)$input['requests'] : 100;
        $concurrency = isset($input['concurrency']) ? (int)$input['concurrency'] : 10;
        
        // Use the global client
        $client = getLDClient();
        
        if (!$client) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => $ldClientError ?? 'SDK not initialized'
            ]);
            exit;
        }
        
        log_message("=== Load Test Configuration ===");
        log_message("Total Requests: {$totalRequests}");
        log_message("Concurrency: {$concurrency}");
        log_message("==============================");
        
        $stats = [
            'totalRequests' => 0,
            'successful' => 0,
            'failed' => 0,
            'totalLatency' => 0,
            'minLatency' => PHP_INT_MAX,
            'maxLatency' => 0
        ];
        
        $startTime = microtime(true);
        
        // Run requests in batches based on concurrency
        $batches = ceil($totalRequests / $concurrency);
        
        for ($batch = 0; $batch < $batches; $batch++) {
            $batchSize = min($concurrency, $totalRequests - ($batch * $concurrency));
            
            for ($i = 0; $i < $batchSize; $i++) {
                $requestNum = ($batch * $concurrency) + $i;
                
                // Create context for this request
                $contextBuilder = \LaunchDarkly\LDContext::builder("load-test-{$requestNum}@example.com");
                $contextBuilder->kind('user');
                $contextBuilder->name("Load Test User {$requestNum}");
                $context = $contextBuilder->build();
                
                $reqStartTime = microtime(true);
                
                try {
                    $flagValue = $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
                    $latency = (microtime(true) - $reqStartTime) * 1000; // Convert to ms
                    
                    // Track custom event with response time metric
                    $client->track('load-test-request', $context, [
                        'requestNumber' => $requestNum,
                        'batchNumber' => $batch,
                        'flagValue' => $flagValue
                    ], $latency);
                    
                    $stats['totalRequests']++;
                    $stats['successful']++;
                    $stats['totalLatency'] += $latency;
                    $stats['minLatency'] = min($stats['minLatency'], $latency);
                    $stats['maxLatency'] = max($stats['maxLatency'], $latency);
                } catch (Exception $e) {
                    $stats['totalRequests']++;
                    $stats['failed']++;
                }
            }
            
            // Log progress every 10 batches
            if (($batch + 1) % 10 === 0) {
                log_message("Progress: {$stats['totalRequests']}/{$totalRequests} requests completed");
            }
        }
        
        $totalTime = microtime(true) - $startTime;
        
        // Flush events to ensure they're sent to LaunchDarkly
        log_message("Flushing events to LaunchDarkly...");
        $client->flush();
        log_message("Events flushed successfully");
        
        // Calculate final stats
        $avgResponseTime = $stats['successful'] > 0 
            ? round($stats['totalLatency'] / $stats['successful'], 2)
            : 0;
        $requestsPerSecond = $totalTime > 0
            ? round($stats['successful'] / $totalTime, 2)
            : 0;
        
        log_message("=== Final Results ===");
        log_message("Total Requests: {$stats['totalRequests']}");
        log_message("Successful: {$stats['successful']}");
        log_message("Failed: {$stats['failed']}");
        log_message("Average Response Time: {$avgResponseTime}ms");
        log_message("Min Latency: " . ($stats['minLatency'] === PHP_INT_MAX ? 'N/A' : round($stats['minLatency'], 2) . 'ms'));
        log_message("Max Latency: " . round($stats['maxLatency'], 2) . "ms");
        log_message("Total Time: " . round($totalTime, 2) . "s");
        log_message("Requests/sec: {$requestsPerSecond}");
        log_message("Load test complete!");
        
        echo json_encode([
            'success' => true,
            'totalRequests' => $stats['totalRequests'],
            'successful' => $stats['successful'],
            'failed' => $stats['failed'],
            'avgResponseTime' => $avgResponseTime,
            'requestsPerSecond' => $requestsPerSecond
        ]);
    } catch (Exception $e) {
        log_message("PHP SDK ERROR during load test: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}

// API: SSE stream for flag updates
// Parse REQUEST_URI to get just the path without query string
$requestPath = parse_url($requestUri, PHP_URL_PATH);
if ($requestPath === '/api/message/stream' && $requestMethod === 'GET') {
    // Get context key from query parameter
    $contextKeyFromUrl = $_GET['contextKey'] ?? null;
    
    // Log that we received the request
    log_message("PHP SDK: SSE endpoint called");
    log_message("PHP SDK: Context key from URL: " . ($contextKeyFromUrl ?? 'none'));
    log_message("PHP SDK: Session context key: " . $_SESSION['php_service_context']['key']);
    
    // Use context key from URL if provided
    if ($contextKeyFromUrl && $contextKeyFromUrl !== $_SESSION['php_service_context']['key']) {
        log_message("PHP SDK: Using context key from URL instead of session");
        $_SESSION['php_service_context']['key'] = $contextKeyFromUrl;
    }
    
    // Make PHP responsive to client disconnects
    ignore_user_abort(false);
    
    // Check if connection is already aborted
    if (connection_aborted()) {
        log_message("PHP SDK: Connection already aborted at start");
        exit;
    }
    
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    
    log_message("PHP SDK: Headers sent");
    
    // Disable output buffering completely for SSE
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    log_message("PHP SDK: Output buffering disabled");
    
    // Helper function to send SSE message
    function sendSSE($message) {
        echo "data: " . json_encode(['message' => $message]) . "\n\n";
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }
    
    // Send immediate "connecting" message BEFORE any SDK initialization
    log_message("PHP SDK: Sending connecting message");
    sendSSE('Connecting to LaunchDarkly...');
    log_message("PHP SDK: Connecting message sent");
    
    try {
        // NOW initialize the SDK (this may take a few seconds)
        $startTime = microtime(true);
        $client = getLDClient();
        $initTime = microtime(true) - $startTime;
        
        if (!$client) {
            $errorMessage = 'SDK Error: ' . ($ldClientError ?? 'Unable to initialize SDK');
            sendSSE($errorMessage);
            exit;
        }
        
        // Log initialization time
        log_message("PHP SDK: Client initialized in " . round($initTime * 1000, 2) . "ms");
        
        // Build context from session using helper function
        $context = buildContextFromSession();
        
        // Wait a moment for Redis to be populated by Relay Proxy (max 2 seconds)
        // This ensures we don't return fallback on initial load
        $maxWaitTime = 2; // seconds
        $waitInterval = 0.1; // 100ms
        $waited = 0;
        $message = null;
        
        log_message("PHP SDK: Waiting for flag data to be available...");
        while ($waited < $maxWaitTime) {
            // Evaluate flag
            $message = $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
            
            // If we got a real value (not fallback), break
            if ($message !== 'Hello from PHP (Fallback - Redis unavailable)') {
                log_message("PHP SDK: Flag data available after " . round($waited, 2) . "s");
                log_message("PHP SDK: SSE flag value: " . $message);
                break;
            }
            
            // Wait a bit and try again
            usleep($waitInterval * 1000000);
            $waited += $waitInterval;
        }
        
        if ($message === 'Hello from PHP (Fallback - Redis unavailable)') {
            log_message("PHP SDK: Still using fallback after " . $maxWaitTime . "s wait");
        }
        
        log_message("PHP SDK: Sending SSE message: " . $message);
        
        // Send actual flag value
        sendSSE($message);
        
        // Keep connection alive with periodic heartbeats
        // In daemon mode, flags are read from Redis. The Relay Proxy updates Redis when flags change.
        // We send periodic heartbeats to detect client disconnects faster.
        $heartbeatInterval = 15; // seconds between heartbeats
        $maxConnectionTime = 300; // 5 minutes max connection time
        $connectionStart = time();
        
        while (true) {
            // Check if connection is still alive
            if (connection_aborted()) {
                log_message("PHP SDK: SSE connection aborted by client");
                break;
            }
            
            // Check if we've exceeded max connection time
            if ((time() - $connectionStart) > $maxConnectionTime) {
                log_message("PHP SDK: SSE connection exceeded max time, closing");
                sendSSE('Connection timeout - please refresh');
                break;
            }
            
            // Send heartbeat comment (keeps connection alive, doesn't trigger client event)
            echo ": heartbeat\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
            
            // Sleep for heartbeat interval
            sleep($heartbeatInterval);
        }
        
    } catch (Exception $e) {
        $errorMessage = 'SDK Error: ' . $e->getMessage();
        sendSSE($errorMessage);
    }
    
    exit;
}

// Handle Redis monitor SSE endpoint
if ($requestUri === '/redis-monitor') {
    // Make PHP responsive to client disconnects
    ignore_user_abort(false);
    
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    
    if (ob_get_level()) ob_end_clean();
    
    // Execute redis-cli MONITOR and stream output
    $handle = popen('redis-cli -h redis MONITOR 2>&1', 'r');
    if ($handle) {
        stream_set_blocking($handle, false);
        $maxConnectionTime = 300; // 5 minutes max
        $connectionStart = time();
        
        while (true) {
            // Check if connection is still alive
            if (connection_aborted()) {
                log_message("Redis monitor: Connection aborted by client");
                break;
            }
            
            // Check if we've exceeded max connection time
            if ((time() - $connectionStart) > $maxConnectionTime) {
                log_message("Redis monitor: Connection exceeded max time, closing");
                break;
            }
            
            $line = fgets($handle);
            if ($line !== false && trim($line) !== '') {
                // Clean up the monitor output
                $cleaned = trim($line);
                echo "data: " . $cleaned . "\n\n";
                flush();
            }
            usleep(50000); // 50ms
        }
        pclose($handle);
    }
    exit;
}

// Get configuration from environment variables
$sdkKey = getenv('LAUNCHDARKLY_SDK_KEY');
$redisHost = getenv('REDIS_HOST') ?: 'redis';
$redisPort = getenv('REDIS_PORT') ?: 6379;
$redisPrefix = getenv('REDIS_PREFIX') ?: null;
$relayProxyUrl = getenv('RELAY_PROXY_URL') ?: 'http://relay-proxy:8030';

// Initialize variables for display
$flagValue = 'Hello from PHP (Fallback - SDK not initialized)';
$errorMessage = null;
$sdkInitialized = false;
$sdkMode = 'Daemon Mode (Redis + Events)';
$usingFeatureRequester = true;

try {
    // Create Predis client
    $redisClient = new Predis\Client([
        'scheme' => 'tcp',
        'host' => $redisHost,
        'port' => (int)$redisPort
    ]);

    // Test Redis connection
    log_message("PHP SDK: Testing Redis connection to {$redisHost}:{$redisPort}");
    $redisClient->ping();
    log_message("PHP SDK: Redis connection successful");

    // Initialize SDK in Daemon Mode (Redis + Events)
    log_message("PHP SDK: Initializing in Daemon Mode (Redis + Events)");
    
    $options = $redisPrefix ? ['prefix' => $redisPrefix] : [];
    $featureStore = Redis::featureRequester($redisClient, $options);
    log_message("PHP SDK: Redis feature store configured" . ($redisPrefix ? " with prefix: {$redisPrefix}" : ""));
    
    $client = new LDClient($sdkKey, [
        'feature_requester' => $featureStore,
        'send_events' => true,           // Enable event sending
        'base_uri' => $relayProxyUrl,    // Send events through relay proxy
        'use_ldd' => false,              // Allow event sending
        'capacity' => 10,
        'flush_interval' => 1
    ]);
    
    log_message("PHP SDK: LaunchDarkly client initialized in Daemon Mode (Redis + Events)");

    $sdkInitialized = true;

    // Create user context based on form input
    $contextType = $_POST['context_type'] ?? 'anonymous';
    $userLocation = $_POST['user_location'] ?? null;
    
    if ($contextType === 'custom' && !empty($_POST['user_email'])) {
        // Custom user context with email as key
        $userKey = $_POST['user_email'];
        $userName = !empty($_POST['user_name']) ? $_POST['user_name'] : null;
        $userEmail = $_POST['user_email'];
    } else {
        // Anonymous user context
        $userKey = 'php-user-' . uniqid();
        $userName = null;
        $userEmail = null;
    }
    
    $contextBuilder = \LaunchDarkly\LDContext::builder($userKey);
    $contextBuilder->kind('user');
    
    if ($userName) {
        $contextBuilder->name($userName);
    }
    if ($userEmail) {
        $contextBuilder->set('email', $userEmail);
    }
    if ($userLocation) {
        $contextBuilder->set('location', $userLocation);
    }
    
    $contextBuilder->set('language', 'PHP');
    $contextBuilder->set('sdk_mode', $sdkMode);
    $contextBuilder->set('anonymous', $contextType === 'anonymous');
    
    $context = $contextBuilder->build();
    log_message("PHP SDK: User context created - Type: {$contextType}, Key: " . $context->getKey());

    // Evaluate user-message feature flag
    log_message("PHP SDK: Evaluating flag 'user-message'");
    $flagValue = $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
    log_message("PHP SDK: Flag evaluation result: {$flagValue}");
    
    // Send a custom track event to test event delivery
    log_message("PHP SDK: Sending custom track event");
    $client->track('page-view', $context, ['page' => 'index', 'timestamp' => time()]);
    log_message("PHP SDK: Track event sent");

    // Flush events immediately to ensure they're sent
    log_message("PHP SDK: Flushing events to relay proxy");
    $client->flush();
    log_message("PHP SDK: Events flushed");
    
    // Register shutdown function to flush events when script ends
    register_shutdown_function(function() use ($client) {
        log_message("PHP SDK: Shutdown - flushing events");
        $client->flush();
    });

} catch (Exception $e) {
    log_message("PHP SDK ERROR: " . $e->getMessage());
    log_message("PHP SDK ERROR Stack trace: " . $e->getTraceAsString());
    $errorMessage = 'SDK Initialization Error: ' . $e->getMessage();
    $flagValue = 'Hello from PHP (Fallback - Error occurred)';
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LaunchDarkly PHP Daemon Mode Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #405BFF;
            padding-bottom: 10px;
        }
        .status {
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            background-color: #e8f4f8;
            border-left: 4px solid #405BFF;
        }
        .error {
            background-color: #fee;
            border-left-color: #c00;
        }
        .success {
            background-color: #efe;
            border-left-color: #0c0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 10px;
            margin: 20px 0;
        }
        .info-label {
            font-weight: bold;
            color: #666;
        }
        .info-value {
            color: #333;
            font-family: 'Courier New', monospace;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            background-color: #405BFF;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 LaunchDarkly PHP Relay Proxy Demo</h1>
        
        <?php if ($errorMessage): ?>
            <div class="status error">
                <strong>⚠️ Error:</strong> <?php echo htmlspecialchars($errorMessage); ?>
            </div>
        <?php elseif ($sdkInitialized): ?>
            <div class="status success">
                <strong>✓ SDK Initialized Successfully</strong> - <?php echo htmlspecialchars($sdkMode); ?>
            </div>
        <?php endif; ?>

        <div class="status">
            <h2>Feature Flag Value</h2>
            <p style="font-size: 18px; margin: 10px 0;">
                <strong>Flag:</strong> <code>user-message</code><br>
                <strong>Value:</strong> <span style="color: #405BFF; font-weight: bold;"><?php echo htmlspecialchars($flagValue); ?></span>
            </p>
        </div>
        
        <!-- Custom Context Form -->
        <div style="margin-top: 30px; padding: 20px; background-color: #f8f9ff; border-radius: 4px; border: 1px solid #405BFF;">
            <h3 style="margin-top: 0; color: #405BFF;">Change User Context</h3>
            <form method="POST" action="/" id="contextForm" style="max-width: 500px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                        <input type="radio" name="context_type" value="anonymous" <?php echo (!isset($_POST['context_type']) || $_POST['context_type'] === 'anonymous') ? 'checked' : ''; ?> onchange="toggleContextInputs()">
                        Anonymous User
                    </label>
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                        <input type="radio" name="context_type" value="custom" <?php echo (isset($_POST['context_type']) && $_POST['context_type'] === 'custom') ? 'checked' : ''; ?> onchange="toggleContextInputs()">
                        Custom User
                    </label>
                </div>
                
                <div id="customContextInputs" style="display: <?php echo (isset($_POST['context_type']) && $_POST['context_type'] === 'custom') ? 'block' : 'none'; ?>;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 500;">Email Address *</label>
                        <input type="email" name="user_email" value="<?php echo htmlspecialchars($_POST['user_email'] ?? ''); ?>" 
                               placeholder="user@example.com"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 500;">Name (optional)</label>
                        <input type="text" name="user_name" value="<?php echo htmlspecialchars($_POST['user_name'] ?? ''); ?>" 
                               placeholder="John Doe"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                    </div>
                </div>
                
                <div style="margin-bottom: 15px; padding: 10px; background-color: #fff; border-radius: 4px;">
                    <span id="locationStatus" style="color: #858585;">Location: Detecting...</span>
                </div>
                
                <input type="hidden" name="user_location" id="userLocation" value="<?php echo htmlspecialchars($_POST['user_location'] ?? ''); ?>">
                
                <button type="submit" style="background-color: #405BFF; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">
                    Update Context
                </button>
            </form>
        </div>
        
        <script>
            let userLocation = '<?php echo htmlspecialchars($_POST['user_location'] ?? ''); ?>';
            
            function toggleContextInputs() {
                const contextType = document.querySelector('input[name="context_type"]:checked').value;
                const customInputs = document.getElementById('customContextInputs');
                customInputs.style.display = contextType === 'custom' ? 'block' : 'none';
            }
            
            async function detectLocation() {
                if (userLocation) {
                    document.getElementById('locationStatus').innerHTML = '<span style="color: #405BFF;">Location: ' + userLocation + '</span>';
                    return;
                }
                
                if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            const latitude = position.coords.latitude;
                            const longitude = position.coords.longitude;
                            
                            try {
                                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                                const data = await response.json();
                                
                                const city = data.address.city || data.address.town || data.address.village || data.address.county;
                                const country = data.address.country;
                                userLocation = city && country ? `${city}, ${country}` : data.display_name;
                                
                                document.getElementById('userLocation').value = userLocation;
                                document.getElementById('locationStatus').innerHTML = '<span style="color: #405BFF;">Location: ' + userLocation + '</span>';
                            } catch (error) {
                                console.error('Geocoding error:', error);
                                userLocation = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                                document.getElementById('userLocation').value = userLocation;
                                document.getElementById('locationStatus').innerHTML = '<span style="color: #405BFF;">Location: ' + userLocation + '</span>';
                            }
                        },
                        (error) => {
                            console.error('Geolocation error:', error);
                            document.getElementById('locationStatus').innerHTML = '<span style="color: #999;">Location: Not available (permission denied or error)</span>';
                        }
                    );
                } else {
                    document.getElementById('locationStatus').innerHTML = '<span style="color: #999;">Location: Not supported by browser</span>';
                }
            }
            
            // Detect location on page load
            detectLocation();
        </script>

        <h2>Configuration Details</h2>
        <div class="info-grid">
            <div class="info-label">SDK Mode:</div>
            <div class="info-value"><span class="badge"><?php echo strtoupper(htmlspecialchars($sdkMode)); ?></span></div>
            
            <div class="info-label">Flag Source:</div>
            <div class="info-value"><?php echo $usingFeatureRequester ? 'Redis (Direct)' : 'Relay Proxy'; ?></div>
            
            <div class="info-label">Events Destination:</div>
            <div class="info-value"><?php echo $sdkInitialized ? 'Relay Proxy' : 'N/A'; ?></div>
            
            <div class="info-label">Redis Host:</div>
            <div class="info-value"><?php echo htmlspecialchars($redisHost); ?></div>
            
            <div class="info-label">Redis Port:</div>
            <div class="info-value"><?php echo htmlspecialchars($redisPort); ?></div>
            
            <?php if ($redisPrefix): ?>
            <div class="info-label">Redis Prefix:</div>
            <div class="info-value"><?php echo htmlspecialchars($redisPrefix); ?></div>
            <?php endif; ?>
            
            <div class="info-label">Relay Proxy URL:</div>
            <div class="info-value"><?php echo htmlspecialchars($relayProxyUrl); ?></div>
        </div>

        <?php if ($usingFeatureRequester): ?>
            <div class="status" style="background-color: #fff3cd; border-left-color: #ffc107;">
                <h3 style="margin-top: 0; color: #856404;">🔍 Daemon Mode Verification</h3>
                <p style="font-size: 14px; color: #856404; margin: 10px 0;">
                    <strong>Proof of Redis Usage:</strong><br>
                    • SDK is configured with Redis feature requester<br>
                    • Flag data is read directly from Redis keys<br>
                    • No HTTP calls to LaunchDarkly for flag evaluations<br>
                    • Events are sent separately to Relay Proxy
                </p>
                <?php
                try {
                    // Show Redis keys to prove we're reading from Redis
                    $keys = $redisClient->keys($redisPrefix ? $redisPrefix . ':*' : 'ld-flags-*');
                    if ($keys && count($keys) > 0) {
                        echo '<p style="font-size: 13px; color: #856404; margin: 10px 0;"><strong>Redis Keys Found:</strong> ' . count($keys) . ' keys</p>';
                        echo '<div style="font-family: monospace; font-size: 11px; color: #666; max-height: 100px; overflow-y: auto; background: #fff; padding: 10px; border-radius: 4px;">';
                        foreach (array_slice($keys, 0, 10) as $key) {
                            echo htmlspecialchars($key) . '<br>';
                        }
                        if (count($keys) > 10) {
                            echo '... and ' . (count($keys) - 10) . ' more';
                        }
                        echo '</div>';
                    }
                } catch (Exception $e) {
                    echo '<p style="font-size: 13px; color: #dc3545;">Could not verify Redis keys: ' . htmlspecialchars($e->getMessage()) . '</p>';
                }
                ?>
            </div>
        <?php endif; ?>

        <?php if ($sdkInitialized && isset($context)): ?>
            <h2>User Context</h2>
            <div class="info-grid">
                <div class="info-label">Type:</div>
                <div class="info-value"><?php echo $context->get('anonymous') ? 'Anonymous' : 'Custom User'; ?></div>
                
                <div class="info-label">User Key:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->getKey()); ?></div>
                
                <?php if ($context->getName()): ?>
                <div class="info-label">Name:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->getName()); ?></div>
                <?php endif; ?>
                
                <?php if ($context->get('email')): ?>
                <div class="info-label">Email:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->get('email')); ?></div>
                <?php endif; ?>
                
                <?php if ($context->get('location')): ?>
                <div class="info-label">Location:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->get('location')); ?></div>
                <?php endif; ?>
                
                <div class="info-label">Language:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->get('language') ?? 'N/A'); ?></div>
                
                <div class="info-label">SDK Mode:</div>
                <div class="info-value"><?php echo htmlspecialchars($context->get('sdk_mode') ?? 'N/A'); ?></div>
            </div>
        <?php endif; ?>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
            <?php if ($usingFeatureRequester): ?>
                <p><strong>About Daemon Mode:</strong> This PHP application reads feature flags directly from Redis without connecting to LaunchDarkly servers. The Relay Proxy populates Redis with flag data, and this application reads from the same Redis instance.</p>
            <?php else: ?>
                <p><strong>About Relay Proxy Mode:</strong> This PHP application connects to the LaunchDarkly Relay Proxy for both feature flag evaluations and event tracking. The Relay Proxy caches flag data in Redis and forwards events to LaunchDarkly, providing low latency and high availability.</p>
            <?php endif; ?>
        </div>
        
        <!-- Redis Monitor -->
        <div style="margin-top: 30px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="margin-top: 0;">Redis Monitor</h2>
            <p style="color: #666; font-size: 14px;">Live stream of Redis commands showing feature flag operations in real-time</p>
            <div style="background-color: #1e1e1e; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #2d2d2d; color: #fff; padding: 10px 15px; font-weight: 600; font-size: 14px; border-bottom: 1px solid #3e3e3e; display: flex; justify-content: space-between; align-items: center;">
                    <span>redis monitor (live commands)</span>
                    <button onclick="clearRedisMonitor()" style="background-color: #405BFF; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Clear</button>
                </div>
                <div id="redis-monitor" style="height: 400px; overflow-y: auto; padding: 15px; font-family: 'Monaco', 'Menlo', 'Courier New', monospace; font-size: 12px; color: #d4d4d4; line-height: 1.5;"></div>
            </div>
        </div>
        
        <script>
            let redisMonitorEventSource = null;
            
            function initRedisMonitor() {
                if (redisMonitorEventSource) {
                    redisMonitorEventSource.close();
                }
                
                redisMonitorEventSource = new EventSource('/redis-monitor');
                
                redisMonitorEventSource.onmessage = function(event) {
                    const message = event.data;
                    
                    // Skip PING commands (health checks) - case insensitive
                    if (message.toLowerCase().includes('"ping"')) {
                        return;
                    }
                    
                    const monitorDiv = document.getElementById('redis-monitor');
                    const logLine = document.createElement('div');
                    logLine.style.marginBottom = '4px';
                    logLine.style.whiteSpace = 'pre-wrap';
                    logLine.style.wordBreak = 'break-all';
                    
                    const timestamp = new Date().toLocaleTimeString();
                    const timestampSpan = document.createElement('span');
                    timestampSpan.style.color = '#858585';
                    timestampSpan.style.marginRight = '8px';
                    timestampSpan.textContent = timestamp;
                    
                    const messageSpan = document.createElement('span');
                    
                    // Color code based on Redis command
                    if (message.includes('GET') || message.includes('HGET')) {
                        messageSpan.style.color = '#4ec9b0';
                    } else if (message.includes('SET') || message.includes('HSET')) {
                        messageSpan.style.color = '#dcdcaa';
                    } else if (message.includes('DEL') || message.includes('EXPIRE')) {
                        messageSpan.style.color = '#f48771';
                    } else {
                        messageSpan.style.color = '#d4d4d4';
                    }
                    
                    messageSpan.textContent = message;
                    
                    logLine.appendChild(timestampSpan);
                    logLine.appendChild(messageSpan);
                    monitorDiv.appendChild(logLine);
                    
                    // Auto-scroll to bottom
                    monitorDiv.scrollTop = monitorDiv.scrollHeight;
                    
                    // Keep only last 500 lines
                    while (monitorDiv.children.length > 500) {
                        monitorDiv.removeChild(monitorDiv.firstChild);
                    }
                };
                
                redisMonitorEventSource.onerror = function(error) {
                    console.error('Redis monitor SSE connection error', error);
                    if (redisMonitorEventSource) {
                        redisMonitorEventSource.close();
                        redisMonitorEventSource = null;
                    }
                    // Retry after 5 seconds
                    setTimeout(initRedisMonitor, 5000);
                };
            }
            
            function clearRedisMonitor() {
                document.getElementById('redis-monitor').innerHTML = '';
            }
            
            // Initialize Redis monitor on page load
            initRedisMonitor();
        </script>
    </div>
</body>
</html>
