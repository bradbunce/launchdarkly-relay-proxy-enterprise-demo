<?php
/**
 * LaunchDarkly PHP SDK Daemon Mode Demo
 * 
 * This application demonstrates the LaunchDarkly PHP SDK in daemon mode,
 * reading feature flags from Redis without connecting to LaunchDarkly servers.
 */

require_once __DIR__ . '/vendor/autoload.php';

use LaunchDarkly\LDClient;
use LaunchDarkly\Integrations\Redis;

// Handle Redis monitor SSE endpoint
if ($_SERVER['REQUEST_URI'] === '/redis-monitor') {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    
    if (ob_get_level()) ob_end_clean();
    
    // Execute redis-cli MONITOR and stream output
    $handle = popen('redis-cli -h redis MONITOR 2>&1', 'r');
    if ($handle) {
        stream_set_blocking($handle, false);
        while (true) {
            $line = fgets($handle);
            if ($line !== false && trim($line) !== '') {
                // Clean up the monitor output
                $cleaned = trim($line);
                echo "data: " . $cleaned . "\n\n";
                flush();
            }
            usleep(50000); // 50ms
            
            // Check if connection is still alive
            if (connection_aborted()) {
                break;
            }
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
$useDaemonMode = getenv('USE_DAEMON_MODE') === 'true'; // Control mode via env var

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

// Initialize variables for display
$flagValue = 'Fallback: SDK not initialized';
$errorMessage = null;
$sdkInitialized = false;
$sdkMode = 'Unknown';
$usingFeatureRequester = false;

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

    // Initialize SDK based on mode
    if ($useDaemonMode) {
        // Daemon Mode: Read flags from Redis, send events through relay proxy
        log_message("PHP SDK: Initializing in Daemon Mode (Redis feature requester + events)");
        
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
        
        $sdkMode = 'Daemon Mode (Redis + Events)';
        $usingFeatureRequester = true;
    } else {
        // Relay Proxy Mode: Everything through relay proxy
        log_message("PHP SDK: Initializing in Relay Proxy Mode");
        
        $client = new LDClient($sdkKey, [
            'send_events' => true,
            'base_uri' => $relayProxyUrl,
            'capacity' => 10,
            'flush_interval' => 1
        ]);
        
        $sdkMode = 'Relay Proxy Mode';
        $usingFeatureRequester = false;
    }
    
    log_message("PHP SDK: LaunchDarkly client initialized in {$sdkMode}");

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
    $flagValue = $client->variation('user-message', $context, 'Fallback: Flag not found');
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
    $flagValue = 'Fallback: Error occurred';
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
                    const message = event.data;
                    
                    // Color code based on Redis command
                    if (message.includes('GET') || message.includes('HGET')) {
                        messageSpan.style.color = '#4ec9b0';
                    } else if (message.includes('SET') || message.includes('HSET')) {
                        messageSpan.style.color = '#dcdcaa';
                    } else if (message.includes('DEL') || message.includes('EXPIRE')) {
                        messageSpan.style.color = '#f48771';
                    } else if (message.includes('PING')) {
                        messageSpan.style.color = '#858585';
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
