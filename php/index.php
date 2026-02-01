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

// In-memory context store to share context between POST endpoint and SSE connections
// This is stored in a file since PHP doesn't have persistent memory between requests
$contextStoreFile = '/tmp/php-context-store.json';

function getContextStore() {
    global $contextStoreFile;
    if (file_exists($contextStoreFile)) {
        $data = file_get_contents($contextStoreFile);
        return json_decode($data, true) ?: [];
    }
    return [];
}

function setContextInStore($key, $context) {
    global $contextStoreFile;
    $store = getContextStore();
    $store[$key] = $context;
    file_put_contents($contextStoreFile, json_encode($store));
}

function getContextFromStore($key) {
    $store = getContextStore();
    return $store[$key] ?? null;
}

// Store current context for PHP service (dashboard)
session_start();
if (!isset($_SESSION['php_service_context'])) {
    $_SESSION['php_service_context'] = [
        'type' => 'anonymous',
        'key' => 'php-anon-' . uniqid(),
        'anonymous' => true
    ];
    
    // Also add to in-memory store
    setContextInStore($_SESSION['php_service_context']['key'], $_SESSION['php_service_context']);
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

// Helper function to build context from session or store
function buildContextFromSession($contextKeyFromUrl = null) {
    // Try to get context from in-memory store first (using context key from URL)
    if ($contextKeyFromUrl) {
        $contextData = getContextFromStore($contextKeyFromUrl);
        if ($contextData) {
            log_message('[buildContextFromSession] Using context from in-memory store: ' . $contextKeyFromUrl);
        } else {
            log_message('[buildContextFromSession] Context key from URL not found in store: ' . $contextKeyFromUrl);
            // Fall back to session
            $contextData = $_SESSION['php_service_context'];
            log_message('[buildContextFromSession] Using context from session');
        }
    } else {
        // Use session context
        $contextData = $_SESSION['php_service_context'];
        log_message('[buildContextFromSession] Using context from session (no URL key provided)');
    }
    
    log_message('[buildContextFromSession] Context data: ' . json_encode($contextData));
    
    $contextBuilder = \LaunchDarkly\LDContext::builder($contextData['key']);
    $contextBuilder->kind('user');
    
    if (isset($contextData['name'])) {
        $contextBuilder->name($contextData['name']);
        log_message('[buildContextFromSession] Added name: ' . $contextData['name']);
    }
    if (isset($contextData['email'])) {
        $contextBuilder->set('email', $contextData['email']);
        log_message('[buildContextFromSession] Added email: ' . $contextData['email']);
    }
    if (isset($contextData['location'])) {
        $contextBuilder->set('location', $contextData['location']);
        log_message('[buildContextFromSession] Added location: ' . $contextData['location']);
    } else {
        log_message('[buildContextFromSession] NO LOCATION in context!');
    }
    if (isset($contextData['anonymous'])) {
        $contextBuilder->set('anonymous', $contextData['anonymous']);
    }
    
    $context = $contextBuilder->build();
    log_message('[buildContextFromSession] Final context: ' . json_encode([
        'key' => $context->getKey(),
        'name' => $context->getName(),
        'email' => $contextData['email'] ?? null,
        'location' => $contextData['location'] ?? null,
        'anonymous' => $contextData['anonymous'] ?? false
    ]));
    
    return $context;
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
    
    // Store context in in-memory store so SSE connections can access it
    $contextKey = $_SESSION['php_service_context']['key'];
    setContextInStore($contextKey, $_SESSION['php_service_context']);
    log_message('[Context Store] Saved context for key: ' . $contextKey);
    log_message('[Context Store] Context data: ' . json_encode($_SESSION['php_service_context']));
    
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
        'mode' => 'Daemon Mode',
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

// API: Get Redis data store (raw flag configurations)
if ($requestUri === '/api/redis-cache' && $requestMethod === 'POST') {
    header('Content-Type: application/json');
    
    try {
        // Access Redis directly to get raw flag configurations (context-independent)
        $redisHost = getenv('REDIS_HOST') ?: 'redis';
        $redisPort = getenv('REDIS_PORT') ?: 6379;
        $redisPrefix = getenv('REDIS_PREFIX') ?: '';
        
        // Initialize Redis client
        $redisClient = new Predis\Client([
            'scheme' => 'tcp',
            'host' => $redisHost,
            'port' => (int)$redisPort
        ]);
        
        // Test Redis connection
        try {
            $redisClient->ping();
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Redis not accessible: ' . $e->getMessage()
            ]);
            exit;
        }
        
        log_message("=== Redis Data Store Request ===");
        log_message("Accessing Redis directly (context-independent)");
        log_message("Redis prefix: " . ($redisPrefix ?: '(none)'));
        
        // Get all flag keys from Redis
        // The LaunchDarkly Relay Proxy stores flags with the pattern: {prefix}:features
        $flagsKey = $redisPrefix ? "{$redisPrefix}:features" : "features";
        
        log_message("Looking for flags at key: {$flagsKey}");
        
        // Get flags from Redis hash
        $allFlags = $redisClient->hgetall($flagsKey);
        
        // Parse JSON values
        $parsedFlags = [];
        foreach ($allFlags as $key => $value) {
            $parsedFlags[$key] = json_decode($value, true);
        }
        
        log_message("Raw Flag Configurations: " . count($parsedFlags) . " flags");
        
        echo json_encode([
            'success' => true,
            'flags' => $parsedFlags,
            'storeType' => 'redis',
            'contextIndependent' => true
        ]);
    } catch (Exception $e) {
        log_message("PHP ERROR getting Redis data store: " . $e->getMessage());
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
    
    // Check if context exists in store
    if ($contextKeyFromUrl) {
        $contextFromStore = getContextFromStore($contextKeyFromUrl);
        log_message("PHP SDK: Context in store: " . ($contextFromStore ? 'yes' : 'no'));
        if ($contextFromStore) {
            log_message("PHP SDK: Context from store: " . json_encode($contextFromStore));
        }
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
        
        // Build context from session or store using helper function
        $context = buildContextFromSession($contextKeyFromUrl);
        
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
        
        // Keep connection alive and poll for flag changes
        // In daemon mode, flags are read from Redis. The Relay Proxy updates Redis when flags change.
        // We poll Redis every 5 seconds to detect flag changes and push updates to the client.
        $pollInterval = 5; // seconds between flag checks
        $maxConnectionTime = 300; // 5 minutes max connection time
        $connectionStart = time();
        $lastFlagValue = $message; // Track last value to detect changes
        
        log_message("PHP SDK: Starting polling loop (checking every {$pollInterval}s for flag changes)");
        
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
            
            // Sleep before checking for updates
            sleep($pollInterval);
            
            // Re-evaluate the flag to check for changes
            try {
                $currentValue = $client->variation('user-message', $context, 'Hello from PHP (Fallback - Redis unavailable)');
                
                // If value changed, send update to client
                if ($currentValue !== $lastFlagValue) {
                    log_message("PHP SDK: Flag value changed from '{$lastFlagValue}' to '{$currentValue}'");
                    sendSSE($currentValue);
                    $lastFlagValue = $currentValue;
                } else {
                    // Send heartbeat comment (keeps connection alive, doesn't trigger client event)
                    echo ": heartbeat\n\n";
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }
            } catch (Exception $e) {
                log_message("PHP SDK: Error polling for flag changes: " . $e->getMessage());
                // Send heartbeat even on error to keep connection alive
                echo ": heartbeat\n\n";
                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();
            }
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

// API: Root endpoint - Simple status response
if ($requestUri === '/' && $requestMethod === 'GET') {
    header('Content-Type: application/json');
    
    $client = getLDClient();
    $sdkInitialized = ($client !== null);
    
    echo json_encode([
        'service' => 'PHP LaunchDarkly API',
        'mode' => 'Daemon Mode (API Only)',
        'sdkInitialized' => $sdkInitialized,
        'endpoints' => [
            'GET /api/status' => 'SDK and Redis status',
            'GET /api/context' => 'Get current context',
            'POST /api/context' => 'Update context',
            'POST /api/test-evaluation' => 'Test flag evaluation',
            'POST /api/redis-cache' => 'Get Redis data store',
            'POST /api/load-test' => 'Run load test',
            'GET /api/message/stream' => 'SSE stream for flag updates',
            'GET /redis-monitor' => 'SSE stream for Redis monitor'
        ]
    ]);
    exit;
}

// If no route matched, return 404
header('Content-Type: application/json');
http_response_code(404);
echo json_encode([
    'error' => 'Not Found',
    'message' => 'The requested endpoint does not exist',
    'availableEndpoints' => [
        'GET /' => 'API information',
        'GET /api/status' => 'SDK and Redis status',
        'GET /api/context' => 'Get current context',
        'POST /api/context' => 'Update context',
        'POST /api/test-evaluation' => 'Test flag evaluation',
        'POST /api/redis-cache' => 'Get Redis data store',
        'POST /api/load-test' => 'Run load test',
        'GET /api/message/stream' => 'SSE stream for flag updates',
        'GET /redis-monitor' => 'SSE stream for Redis monitor'
    ]
]);
?>
