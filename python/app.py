"""
LaunchDarkly Python SDK Demo Application

This Flask application demonstrates the LaunchDarkly Python server-side SDK
with default configuration (direct connection to LaunchDarkly).
"""

import os
import logging
import time
import hashlib
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
import ldclient
from ldclient.config import Config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask application
app = Flask(__name__)

# Enable CORS for dashboard access
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:8000", "http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# ============================================================================
# LaunchDarkly SDK Initialization (Singleton Pattern)
# ============================================================================

# Global SDK client instance (singleton)
_ld_client = None
_sdk_initialized = False
_sdk_initialization_error = None

# Global current context (for dashboard context editor)
# Generate a random anonymous context key on startup
# Use multi-context structure with user and container contexts
current_context = {
    'kind': 'multi',
    'user': {
        'kind': 'user',
        'key': f'python-anon-{uuid.uuid4()}',
        'anonymous': True
    },
    'container': {
        'kind': 'container',
        'key': 'python-app'
    }
}


def initialize_launchdarkly_sdk():
    """
    Initialize the LaunchDarkly SDK with default configuration.
    
    This function implements the singleton pattern for the SDK client.
    It connects directly to LaunchDarkly (not through Relay Proxy).
    
    Returns:
        bool: True if initialization succeeded, False otherwise
    """
    global _ld_client, _sdk_initialized, _sdk_initialization_error
    
    # Return existing client if already initialized
    if _sdk_initialized and _ld_client is not None:
        logger.info("LaunchDarkly SDK already initialized")
        return True
    
    try:
        # Get SDK key from environment
        sdk_key = os.environ.get('LAUNCHDARKLY_SDK_KEY')
        
        if not sdk_key:
            error_msg = "LAUNCHDARKLY_SDK_KEY environment variable not set"
            logger.error(error_msg)
            _sdk_initialization_error = error_msg
            _sdk_initialized = False
            return False
        
        logger.info("Initializing LaunchDarkly SDK with default configuration...")
        logger.info("SDK will connect directly to LaunchDarkly (not through Relay Proxy)")
        
        # Create SDK configuration with default settings
        # Default configuration connects directly to LaunchDarkly for:
        # - Streaming flag updates (clientstream.launchdarkly.com)
        # - Event reporting (events.launchdarkly.com)
        config = Config(sdk_key=sdk_key)
        
        # Initialize the SDK
        ldclient.set_config(config)
        _ld_client = ldclient.get()
        
        # Wait for SDK initialization (with timeout)
        logger.info("Waiting for SDK initialization...")
        initialization_timeout = 10  # seconds
        start_time = time.time()
        
        while not _ld_client.is_initialized():
            if time.time() - start_time > initialization_timeout:
                error_msg = f"SDK initialization timed out after {initialization_timeout} seconds"
                logger.error(error_msg)
                _sdk_initialization_error = error_msg
                _sdk_initialized = False
                return False
            
            time.sleep(0.1)  # Check every 100ms
        
        # SDK initialized successfully
        _sdk_initialized = True
        _sdk_initialization_error = None
        logger.info("✓ LaunchDarkly SDK initialized successfully")
        logger.info(f"SDK Version: {ldclient.VERSION}")
        logger.info("SDK is connected and ready to evaluate flags")
        
        return True
        
    except Exception as e:
        error_msg = f"Failed to initialize LaunchDarkly SDK: {str(e)}"
        logger.error(error_msg, exc_info=True)
        _sdk_initialization_error = error_msg
        _sdk_initialized = False
        return False


def get_ld_client():
    """
    Get the LaunchDarkly SDK client instance (singleton).
    
    Returns:
        ldclient.LDClient: The SDK client instance, or None if not initialized
    """
    return _ld_client


def is_sdk_initialized():
    """
    Check if the LaunchDarkly SDK is initialized and ready.
    
    Returns:
        bool: True if SDK is initialized, False otherwise
    """
    return _sdk_initialized and _ld_client is not None and _ld_client.is_initialized()


def get_sdk_connection_state():
    """
    Get the current SDK connection state.
    
    Returns:
        str: Connection state - "VALID", "INITIALIZING", "INTERRUPTED", or "OFF"
    """
    if not _sdk_initialized or _ld_client is None:
        return "OFF"
    
    if not _ld_client.is_initialized():
        return "INITIALIZING"
    
    # For Python SDK, if initialized successfully, connection is VALID
    # The SDK handles reconnection automatically if connection is lost
    return "VALID"


def get_sdk_initialization_error():
    """
    Get the SDK initialization error message, if any.
    
    Returns:
        str: Error message, or None if no error
    """
    return _sdk_initialization_error


# Initialize SDK when module is loaded
logger.info("=" * 70)
logger.info("Python LaunchDarkly SDK Demo Application Starting")
logger.info("=" * 70)

initialization_success = initialize_launchdarkly_sdk()

if initialization_success:
    logger.info("Application ready to serve requests")
else:
    logger.warning("Application starting in degraded mode (SDK not initialized)")
    logger.warning("Flag evaluations will return default values")

logger.info("=" * 70)


# ============================================================================
# Hash Value Calculation for Bucketing
# ============================================================================

def calculate_hash_value(flag_key, context_key, salt):
    """
    Calculate hash value and bucket value for LaunchDarkly bucketing.
    
    LaunchDarkly uses a specific hashing algorithm for user bucketing in
    percentage rollouts and experiments. This function replicates that
    algorithm to demonstrate how users are assigned to variations.
    
    The algorithm:
    1. Concatenate flag_key + "." + salt + "." + context_key
    2. Calculate SHA-1 hash of the concatenated string
    3. Take first 15 characters of hex digest
    4. Convert to integer (base 16)
    5. Divide by 0xFFFFFFFFFFFFFFF (15 F's) to get bucket value (0.0 to 1.0)
    
    Args:
        flag_key (str): The feature flag key
        context_key (str): The context/user key
        salt (str): The flag's salt value (from flag configuration)
    
    Returns:
        dict: Dictionary containing:
            - hashValue (int): The calculated hash value
            - bucketValue (float): The normalized bucket value (0.0 to 1.0)
            - salt (str): The salt used in calculation
    
    Example:
        >>> result = calculate_hash_value("user-message", "user-123", "94b881a3be5c449d99dbbe1a92ca3fa0")
        >>> print(result["bucketValue"])
        0.45082819853739825
    """
    try:
        # Validate inputs
        if not flag_key or not context_key or not salt:
            logger.warning("Invalid inputs for hash calculation")
            return None
        
        # Concatenate: flag_key.salt.context_key
        hash_input = f"{flag_key}.{salt}.{context_key}"
        
        # Calculate SHA-1 hash
        sha1_hash = hashlib.sha1(hash_input.encode('utf-8')).hexdigest()
        
        # Take first 15 characters and convert to integer
        hash_prefix = sha1_hash[:15]
        hash_value = int(hash_prefix, 16)
        
        # Normalize to 0.0 - 1.0 range
        # Divide by 0xFFFFFFFFFFFFFFF (15 F's = 1152921504606846975)
        max_hash = 0xFFFFFFFFFFFFFFF
        bucket_value = hash_value / max_hash
        
        logger.debug(f"Hash calculation: input='{hash_input}', hash={hash_value}, bucket={bucket_value}")
        
        return {
            "hashValue": hash_value,
            "bucketValue": bucket_value,
            "salt": salt
        }
        
    except Exception as e:
        logger.error(f"Error calculating hash value: {str(e)}", exc_info=True)
        return None


def get_flag_salt(flag_key):
    """
    Get the salt value for a feature flag from the SDK's data store.
    
    The salt is used in hash calculations for bucketing users into variations.
    Each flag has its own salt value stored in the flag configuration.
    
    Args:
        flag_key (str): The feature flag key
    
    Returns:
        str: The flag's salt value, or the flag_key as fallback
    """
    try:
        client = get_ld_client()
        
        if not client or not is_sdk_initialized():
            logger.warning("SDK not initialized, using flag key as salt")
            return flag_key
        
        # The Python SDK doesn't expose flag configuration directly
        # We'll use the flag key as the salt (common fallback)
        # In production, you would get this from the flag configuration
        # For this demo, we'll use a known salt value for the user-message flag
        
        # Known salt for user-message flag (from LaunchDarkly configuration)
        if flag_key == "user-message":
            return "94b881a3be5c449d99dbbe1a92ca3fa0"
        
        # Fallback to flag key
        return flag_key
        
    except Exception as e:
        logger.error(f"Error getting flag salt: {str(e)}")
        return flag_key


# ============================================================================
# Context Creation and Management
# ============================================================================
# Context Creation and Management
# ============================================================================

def buildContext(context_data):
    """
    Build a multi-context from user attributes.
    
    This helper function constructs a LaunchDarkly multi-context containing both
    a user context and a container context. The multi-context structure enables
    flag targeting rules to evaluate based on both user attributes (email, name,
    location) and container attributes (service identifier).
    
    This function matches the pattern used in Node.js and PHP services to ensure
    consistent flag evaluation behavior across all three services.
    
    Args:
        context_data (dict): Dictionary containing user attributes:
            - key (str): User context key (required)
            - email (str, optional): User email address
            - name (str, optional): User display name
            - location (str, optional): User location
            - anonymous (bool, optional): Whether user is anonymous
    
    Returns:
        ldclient.Context: A multi-context containing user and container contexts
    
    Raises:
        ValueError: If context_data is None or missing required 'key' field
        RuntimeError: If context creation fails
    
    Example:
        >>> context_data = {
        ...     'key': 'user-123',
        ...     'email': 'user@example.com',
        ...     'name': 'John Doe',
        ...     'location': 'New York'
        ... }
        >>> context = buildContext(context_data)
        >>> flag_value = client.variation("my-flag", context, default_value)
    """
    # Validate context_data
    if context_data is None:
        raise ValueError("context_data cannot be None")
    
    if not isinstance(context_data, dict):
        raise ValueError(f"context_data must be a dictionary, got {type(context_data).__name__}")
    
    # Extract user attributes
    context_key = context_data.get('key')
    email = context_data.get('email')
    name = context_data.get('name')
    location = context_data.get('location')
    anonymous = context_data.get('anonymous', False)
    
    # Validate context key
    if not context_key:
        raise ValueError("context_data must contain a 'key' field")
    
    try:
        # Import Context from ldclient
        from ldclient import Context
        
        # Build user context
        user_context_builder = Context.builder(context_key)
        user_context_builder.kind("user")
        
        # Set anonymous flag
        if anonymous:
            user_context_builder.anonymous(True)
        
        # Add email attribute if provided and non-empty
        if email and isinstance(email, str) and email.strip():
            user_context_builder.set("email", email.strip())
        
        # Add name attribute if provided and non-empty
        if name and isinstance(name, str) and name.strip():
            user_context_builder.set("name", name.strip())
        
        # Add location attribute if provided and non-empty
        if location and isinstance(location, str) and location.strip():
            user_context_builder.set("location", location.strip())
        
        user_context = user_context_builder.build()
        
        # Build container context with static key "python-app"
        container_context = Context.builder("python-app").kind("container").build()
        
        # Create multi-context combining user and container contexts
        multi_context = Context.create_multi(user_context, container_context)
        
        logger.debug(f"Created multi-context: user={context_key}, container=python-app")
        
        return multi_context
        
    except Exception as e:
        error_msg = f"Failed to build multi-context: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise RuntimeError(error_msg) from e


def create_context(context_key, email=None, name=None, location=None):
    """
    Create a LaunchDarkly multi-context for flag evaluation.
    
    This function creates a multi-context containing both a user context and a
    container context. Multi-contexts enable flag targeting rules to evaluate
    based on both user attributes (email, name, location) and container attributes
    (service identifier).
    
    The function validates input parameters and builds a multi-context structure
    that matches the pattern used in Node.js and PHP services.
    
    Args:
        context_key (str): Unique identifier for the user context (required)
        email (str, optional): User email address
        name (str, optional): User display name
        location (str, optional): User location
    
    Returns:
        ldclient.Context: A multi-context containing user and container contexts
    
    Raises:
        ValueError: If context_key is None, empty, or not a string
        TypeError: If email, name, or location are provided but not strings
        RuntimeError: If context creation fails
    
    Example:
        >>> context = create_context("user-123", email="user@example.com", name="John Doe", location="New York")
        >>> flag_value = client.variation("my-flag", context, default_value)
    """
    # Validate context_key (required parameter)
    if context_key is None:
        raise ValueError("context_key cannot be None")
    
    if not isinstance(context_key, str):
        raise ValueError(f"context_key must be a string, got {type(context_key).__name__}")
    
    if not context_key or not context_key.strip():
        raise ValueError("context_key cannot be empty or whitespace")
    
    # Validate email if provided
    if email is not None:
        if not isinstance(email, str):
            raise TypeError(f"email must be a string, got {type(email).__name__}")
        
        # Basic email validation - check for @ symbol
        if email and '@' not in email:
            logger.warning(f"Email '{email}' does not appear to be valid (missing @)")
    
    # Validate name if provided
    if name is not None:
        if not isinstance(name, str):
            raise TypeError(f"name must be a string, got {type(name).__name__}")
    
    # Validate location if provided
    if location is not None:
        if not isinstance(location, str):
            raise TypeError(f"location must be a string, got {type(location).__name__}")
    
    try:
        # Import Context from ldclient
        from ldclient import Context
        
        # Build user context with the key
        user_context_builder = Context.builder(context_key.strip())
        user_context_builder.kind("user")
        
        # Add email attribute if provided and non-empty
        if email and email.strip():
            user_context_builder.set("email", email.strip())
        
        # Add name attribute if provided and non-empty
        if name and name.strip():
            user_context_builder.set("name", name.strip())
        
        # Add location attribute if provided and non-empty
        if location and location.strip():
            user_context_builder.set("location", location.strip())
        
        user_context = user_context_builder.build()
        
        # Build container context with static key "python-app"
        container_context = Context.builder("python-app").kind("container").build()
        
        # Create multi-context combining user and container contexts
        multi_context = Context.create_multi(user_context, container_context)
        
        logger.debug(f"Created multi-context: user={context_key}, container=python-app, email={email}, name={name}, location={location}")
        
        return multi_context
        
    except Exception as e:
        error_msg = f"Failed to create multi-context: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise RuntimeError(error_msg) from e


def validate_context_key(context_key):
    """
    Validate a context key for use in flag evaluation.
    
    This is a helper function that performs validation without creating
    a full context object. Useful for pre-validation in API endpoints.
    
    Args:
        context_key (str): The context key to validate
    
    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    
    Example:
        >>> is_valid, error = validate_context_key("user-123")
        >>> if not is_valid:
        ...     return jsonify({"error": error}), 400
    """
    if context_key is None:
        return False, "context_key cannot be None"
    
    if not isinstance(context_key, str):
        return False, f"context_key must be a string, got {type(context_key).__name__}"
    
    if not context_key or not context_key.strip():
        return False, "context_key cannot be empty or whitespace"
    
    return True, None


# ============================================================================
# Flag Evaluation Logic
# ============================================================================

def evaluate_flag(flag_key, context, default_value):
    """
    Evaluate a feature flag for a given context.
    
    This function evaluates a feature flag using the LaunchDarkly SDK and returns
    both the flag value and detailed evaluation reason. It handles SDK not initialized
    state gracefully by returning the default value with an error reason.
    
    Args:
        flag_key (str): The key of the feature flag to evaluate
        context (ldclient.Context): The evaluation context (user/entity)
        default_value: The default value to return if evaluation fails
    
    Returns:
        dict: A dictionary containing:
            - value: The evaluated flag value (or default if error)
            - reason: Evaluation reason details with:
                - kind: Reason kind (e.g., "RULE_MATCH", "FALLTHROUGH", "ERROR")
                - ruleIndex: Index of matched rule (if applicable)
                - ruleId: ID of matched rule (if applicable)
                - errorKind: Error type (if kind is "ERROR")
    
    Example:
        >>> context = create_context("user-123", email="user@example.com")
        >>> result = evaluate_flag("user-message", context, "Hello!")
        >>> print(result["value"])
        "Welcome back!"
        >>> print(result["reason"]["kind"])
        "RULE_MATCH"
    """
    try:
        # Get SDK client
        client = get_ld_client()
        
        # Check if SDK is initialized
        if not is_sdk_initialized() or client is None:
            logger.warning(f"SDK not initialized, returning default value for flag '{flag_key}'")
            return {
                "value": default_value,
                "reason": {
                    "kind": "ERROR",
                    "errorKind": "CLIENT_NOT_READY"
                }
            }
        
        # Evaluate flag with detailed reason
        detail = client.variation_detail(flag_key, context, default_value)
        
        # Log the evaluation result with reason
        logger.info(f"Flag '{flag_key}' evaluated: value='{detail.value}', reason={detail.reason}")
        
        # The Python SDK returns reason as a dict, not an object
        # Build reason object from the dict
        reason_dict = detail.reason if isinstance(detail.reason, dict) else {}
        
        reason = {
            "kind": reason_dict.get("kind", "UNKNOWN")
        }
        
        # Add rule information if available
        if "ruleIndex" in reason_dict and reason_dict["ruleIndex"] is not None:
            reason["ruleIndex"] = reason_dict["ruleIndex"]
        
        if "ruleId" in reason_dict and reason_dict["ruleId"] is not None:
            reason["ruleId"] = reason_dict["ruleId"]
        
        # Add error kind if this is an error reason
        if "errorKind" in reason_dict and reason_dict["errorKind"] is not None:
            reason["errorKind"] = reason_dict["errorKind"]
        
        # Only log at debug level to avoid flooding logs during SSE polling
        logger.debug(f"Flag '{flag_key}' evaluated to '{detail.value}' with reason '{reason['kind']}'")
        
        return {
            "value": detail.value,
            "reason": reason
        }
        
    except Exception as e:
        # Handle any unexpected errors during evaluation
        logger.error(f"Error evaluating flag '{flag_key}': {str(e)}", exc_info=True)
        return {
            "value": default_value,
            "reason": {
                "kind": "ERROR",
                "errorKind": "EXCEPTION",
                "errorMessage": str(e)
            }
        }


# ============================================================================
# Flask Application Routes
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for Docker health checks.
    
    Returns healthy status when SDK is initialized, unhealthy otherwise.
    
    Returns:
        JSON response with health status
    """
    initialized = is_sdk_initialized()
    
    if initialized:
        return jsonify({
            "status": "healthy",
            "service": "python-app-dev",
            "sdkInitialized": True
        }), 200
    else:
        return jsonify({
            "status": "unhealthy",
            "service": "python-app-dev",
            "sdkInitialized": False,
            "error": _sdk_initialization_error
        }), 503


@app.route('/api/status', methods=['GET'])
def get_status():
    """
    Status endpoint - returns SDK connection status and version.
    
    Returns:
        JSON response with SDK status information
    """
    try:
        connection_state = get_sdk_connection_state()
        initialized = is_sdk_initialized()
        
        # Get SDK version
        sdk_version = ldclient.VERSION if initialized else "not-initialized"
        
        # Determine if connected
        connected = initialized and connection_state == "VALID"
        
        response = {
            "connected": connected,
            "mode": "default",
            "sdkVersion": sdk_version,
            "sdkInitialized": initialized,
            "connectionState": connection_state
        }
        
        # Add error information if SDK failed to initialize
        if not initialized and _sdk_initialization_error:
            response["error"] = _sdk_initialization_error
        
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error in status endpoint: {str(e)}", exc_info=True)
        return jsonify({
            "connected": False,
            "mode": "default",
            "sdkVersion": "error",
            "sdkInitialized": False,
            "connectionState": "OFF",
            "error": str(e)
        }), 500


@app.route('/api/flag', methods=['GET'])
def flag_endpoint():
    """
    Flag evaluation endpoint - evaluates user-message flag.
    
    Accepts contextKey, email, and name query parameters, evaluates the
    'user-message' flag for the given context, and returns the flag value
    and evaluation reason.
    
    If no contextKey is provided, uses the current global context.
    
    Query Parameters:
        contextKey (optional): User context key (uses current_context if not provided)
        email (optional): User email address
        name (optional): User display name
    
    Returns:
        JSON response with flag value, evaluation reason, and context info
        
    Example:
        GET /api/flag?contextKey=user-123&email=user@example.com&name=John
        
        Response:
        {
            "value": "Welcome back!",
            "reason": {
                "kind": "RULE_MATCH",
                "ruleIndex": 0,
                "ruleId": "rule-123"
            },
            "context": { ... }
        }
    """
    try:
        # Get query parameters
        context_key = request.args.get('contextKey')
        email = request.args.get('email')
        name = request.args.get('name')
        location = request.args.get('location')
        
        # Use current_context if no contextKey provided
        if not context_key:
            global current_context
            if current_context:
                # Extract context key from multi-context structure
                if current_context.get('kind') == 'multi':
                    context_key = current_context.get('user', {}).get('key')
                    # Use email, name, and location from user sub-context if not provided in query
                    if not email and 'email' in current_context.get('user', {}):
                        email = current_context.get('user', {}).get('email')
                    if not name and 'name' in current_context.get('user', {}):
                        name = current_context.get('user', {}).get('name')
                    if not location and 'location' in current_context.get('user', {}):
                        location = current_context.get('user', {}).get('location')
                else:
                    # Fallback for old single-context format
                    context_key = current_context.get('key')
                    if not email and 'email' in current_context:
                        email = current_context.get('email')
                    if not name and 'name' in current_context:
                        name = current_context.get('name')
                    if not location and 'location' in current_context:
                        location = current_context.get('location')
                logger.info(f"Using current_context: {context_key}")
            else:
                logger.warning("No contextKey provided and no current_context available")
                return jsonify({
                    "error": "Missing required parameter: contextKey",
                    "value": "Hello from Python!",
                    "reason": {
                        "kind": "ERROR",
                        "errorKind": "MISSING_PARAMETER"
                    }
                }), 400
        
        # Validate context key
        is_valid, error_message = validate_context_key(context_key)
        if not is_valid:
            logger.warning(f"Invalid contextKey: {error_message}")
            return jsonify({
                "error": f"Invalid contextKey: {error_message}",
                "value": "Hello from Python!",
                "reason": {
                    "kind": "ERROR",
                    "errorKind": "INVALID_PARAMETER"
                }
            }), 400
        
        # Create context with provided attributes
        try:
            context = create_context(context_key, email=email, name=name, location=location)
            logger.info(f"Created context for flag evaluation: key={context_key}, email={email}, name={name}, location={location}")
        except (ValueError, TypeError, RuntimeError) as e:
            logger.error(f"Failed to create context: {str(e)}")
            return jsonify({
                "error": f"Failed to create context: {str(e)}",
                "value": "Hello from Python!",
                "reason": {
                    "kind": "ERROR",
                    "errorKind": "CONTEXT_CREATION_FAILED"
                }
            }), 400
        
        # Evaluate the user-message flag
        default_value = "Hello from Python!"
        result = evaluate_flag("user-message", context, default_value)
        
        # Calculate hash value for bucketing demonstration
        try:
            salt = get_flag_salt("user-message")
            hash_info = calculate_hash_value("user-message", context_key, salt)
            if hash_info:
                result["hashInfo"] = hash_info
                logger.debug(f"Calculated hash info for flag endpoint: {hash_info}")
        except Exception as hash_error:
            logger.error(f"Error calculating hash value: {str(hash_error)}")
            result["hashInfo"] = None
        
        logger.info(f"Flag 'user-message' evaluated for context '{context_key}': {result['value']}")
        
        # Add context information to response (convert multi-context to dict)
        # The context is a multi-context, so we need to extract both user and container contexts
        context_dict = {
            'kind': 'multi'
        }
        
        # Try to extract user context
        if hasattr(context, 'get_individual_context'):
            user_context = context.get_individual_context('user')
            if user_context:
                user_dict = {
                    'kind': 'user',
                    'key': user_context.key if hasattr(user_context, 'key') else context_key,
                    'anonymous': user_context.anonymous if hasattr(user_context, 'anonymous') else False
                }
                
                # Add optional built-in attributes if present
                if hasattr(user_context, 'name') and user_context.name:
                    user_dict['name'] = user_context.name
                if hasattr(user_context, 'email') and user_context.email:
                    user_dict['email'] = user_context.email
                
                # Add custom attributes (like location) if present
                try:
                    if hasattr(user_context, 'get'):
                        location_val = user_context.get('location')
                        if location_val:
                            user_dict['location'] = location_val
                except Exception as e:
                    logger.debug(f"Could not retrieve custom attributes: {e}")
                
                context_dict['user'] = user_dict
            
            # Extract container context
            container_context = context.get_individual_context('container')
            if container_context:
                context_dict['container'] = {
                    'kind': 'container',
                    'key': container_context.key if hasattr(container_context, 'key') else 'python-app'
                }
        else:
            # Fallback: construct from parameters if SDK doesn't support get_individual_context
            context_dict['user'] = {
                'kind': 'user',
                'key': context_key,
                'anonymous': not bool(email)
            }
            if email:
                context_dict['user']['email'] = email
            if name:
                context_dict['user']['name'] = name
            if location:
                context_dict['user']['location'] = location
            
            context_dict['container'] = {
                'kind': 'container',
                'key': 'python-app'
            }
        
        result["context"] = context_dict
        
        # Return evaluation result
        return jsonify(result), 200
        
    except Exception as e:
        # Handle any unexpected errors
        logger.error(f"Unexpected error in flag endpoint: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Internal server error",
            "value": "Hello from Python!",
            "reason": {
                "kind": "ERROR",
                "errorKind": "INTERNAL_ERROR"
            }
        }), 500


@app.route('/api/context', methods=['GET', 'POST', 'OPTIONS'])
def context_endpoint():
    """
    Context endpoint - get or update the evaluation context.
    
    GET: Returns the current context
    Returns:
    {
        "kind": "user",
        "key": "...",
        "anonymous": true/false,
        ...
    }
    
    POST: Updates the context
    Accepts POST requests with JSON body:
    {
        "type": "anonymous" | "custom",
        "email": "user@example.com",  // required for custom
        "name": "User Name",           // optional
        "location": "City, Country"    // optional
    }
    
    Returns:
    {
        "success": true,
        "context": { ... }
    }
    """
    global current_context
    
    # Get origin from request
    origin = request.headers.get('Origin', 'http://localhost:8000')
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        return response, 200
    
    # Handle GET request - return current context
    if request.method == 'GET':
        response = jsonify(current_context)
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        data = request.get_json()
        context_type = data.get('type', 'anonymous')
        email = data.get('email')
        name = data.get('name')
        location = data.get('location')
        
        if context_type == 'custom':
            if not email or email.strip() == '':
                response = jsonify({
                    'success': False,
                    'error': 'Email is required for custom context'
                })
                response.headers.add('Access-Control-Allow-Origin', origin)
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response, 400
            
            # Create custom multi-context
            new_context = {
                'kind': 'multi',
                'user': {
                    'kind': 'user',
                    'key': email,
                    'email': email,
                    'anonymous': False
                },
                'container': {
                    'kind': 'container',
                    'key': 'python-app'
                }
            }
            
            if name and name.strip():
                new_context['user']['name'] = name
            if location and location.strip():
                new_context['user']['location'] = location
        else:
            # Create anonymous multi-context
            # Generate new key only if switching from custom or no context exists
            needs_new_key = (not current_context or 
                           not isinstance(current_context, dict) or
                           current_context.get('kind') != 'multi' or
                           not current_context.get('user', {}).get('anonymous', False) or
                           not current_context.get('user', {}).get('key', '').startswith('python-anon-'))
            
            if needs_new_key:
                context_key = f'python-anon-{uuid.uuid4()}'
            else:
                context_key = current_context.get('user', {}).get('key', f'python-anon-{uuid.uuid4()}')
            
            new_context = {
                'kind': 'multi',
                'user': {
                    'kind': 'user',
                    'key': context_key,
                    'anonymous': True
                },
                'container': {
                    'kind': 'container',
                    'key': 'python-app'
                }
            }
            
            if location and location.strip():
                new_context['user']['location'] = location
        
        # Update global context
        current_context = new_context
        
        # Extract user key for logging
        user_key = new_context.get('user', {}).get('key', 'unknown')
        logger.info(f"Context updated: {context_type} ({user_key})")
        if location:
            logger.info(f"  Location: {location}")
        
        response = jsonify({
            'success': True,
            'context': new_context
        })
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
        
    except Exception as e:
        logger.error(f"Error updating context: {str(e)}", exc_info=True)
        response = jsonify({
            'success': False,
            'error': str(e)
        })
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500


@app.route('/api/sdk-data-store', methods=['GET', 'POST'])
def get_sdk_data_store():
    """
    SDK data store endpoint - returns raw flag configurations from the SDK's feature store.

    This endpoint accesses the Python SDK's internal feature store to retrieve
    detailed flag configurations including rules, variations, targets, and other
    metadata. This matches the behavior of the Node.js SDK's inspectable store.

    Returns:
        JSON response with detailed flag configurations
    """
    try:
        # Check if SDK is initialized
        if not is_sdk_initialized():
            logger.warning("SDK not initialized, cannot retrieve flag data")
            return jsonify({
                "success": False,
                "error": "SDK not initialized",
                "sdkInitialized": False,
                "flags": {}
            }), 503

        # Get SDK client
        client = get_ld_client()

        if client is None:
            logger.error("SDK client is None")
            return jsonify({
                "success": False,
                "error": "SDK client not available",
                "sdkInitialized": False,
                "flags": {}
            }), 503

        try:
            # Access the feature store from the SDK's config
            feature_store = client._config.feature_store

            if feature_store is None:
                logger.error("Feature store not available")
                return jsonify({
                    "success": False,
                    "error": "Feature store not available",
                    "sdkInitialized": True,
                    "flags": {}
                }), 500

            # Import FEATURES kind for querying the store
            from ldclient.versioned_data_kind import FEATURES

            # Get all flags from the feature store using callback pattern
            result_container = {'flags': None}

            def callback(result):
                result_container['flags'] = result

            feature_store.all(FEATURES, callback)
            raw_flags = result_container['flags']

            if raw_flags is None:
                logger.warning("No flags retrieved from feature store")
                return jsonify({
                    "success": False,
                    "error": "No flags in feature store",
                    "sdkInitialized": True,
                    "flags": {}
                }), 500

            # Convert FeatureFlag objects to dictionaries
            flags_dict = {}
            for key, flag_obj in raw_flags.items():
                # Each flag_obj is a FeatureFlag instance with a to_json_dict() method
                if hasattr(flag_obj, 'to_json_dict'):
                    flags_dict[key] = flag_obj.to_json_dict()
                else:
                    # Fallback: parse string representation
                    import json
                    flags_dict[key] = json.loads(str(flag_obj))

            logger.info(f"Retrieved {len(flags_dict)} flags from feature store")

            # Return the flags data
            response = {
                "success": True,
                "flags": flags_dict,
                "sdkInitialized": True,
                "flagCount": len(flags_dict),
                "contextIndependent": True,  # Raw configurations are context-independent
                "storeType": "in-memory-feature-store"
            }

            return jsonify(response), 200

        except Exception as e:
            logger.error(f"Error accessing feature store: {str(e)}", exc_info=True)
            return jsonify({
                "success": False,
                "error": f"Error accessing feature store: {str(e)}",
                "sdkInitialized": True,
                "flags": {}
            }), 500

    except Exception as e:
        # Handle any unexpected errors
        logger.error(f"Error in sdk-data-store endpoint: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "message": str(e),
            "flags": {}
        }), 500


@app.route('/api/sse', methods=['GET'])
@app.route('/api/message/stream', methods=['GET'])  # Alias for dashboard compatibility
def sse_endpoint():
    """
    Server-Sent Events endpoint for real-time flag updates.
    
    Establishes a persistent connection to stream flag value changes in real-time.
    Sends initial flag value immediately, then streams updates when the flag changes.
    Includes heartbeat messages every 15 seconds to keep connection alive.
    
    Query Parameters:
        contextKey (required): User context key
        email (optional): User email address
        name (optional): User display name
    
    Returns:
        Server-Sent Events stream (text/event-stream)
        
    Event Format:
        data: {"value": "flag-value", "timestamp": 1234567890}
        
    Heartbeat Format:
        : heartbeat
        
    Example:
        GET /api/sse?contextKey=user-123&email=user@example.com&name=John
        
        Response Stream:
        data: {"value": "Hello!", "timestamp": 1234567890}
        
        : heartbeat
        
        data: {"value": "Welcome!", "timestamp": 1234567891}
    """
    from flask import Response, stream_with_context
    import json
    import queue
    import threading
    
    try:
        # Get query parameters
        context_key = request.args.get('contextKey')
        email = request.args.get('email')
        name = request.args.get('name')
        location = request.args.get('location')
        
        # Validate required parameter
        if not context_key:
            logger.warning("SSE request missing contextKey parameter")
            return jsonify({
                "error": "Missing required parameter: contextKey"
            }), 400
        
        # Validate context key
        is_valid, error_message = validate_context_key(context_key)
        if not is_valid:
            logger.warning(f"Invalid contextKey for SSE: {error_message}")
            return jsonify({
                "error": f"Invalid contextKey: {error_message}"
            }), 400
        
        # Create context with provided attributes
        try:
            context = create_context(context_key, email=email, name=name, location=location)
            logger.info(f"SSE: Created context for flag evaluation: key={context_key}, email={email}, name={name}, location={location}")
        except (ValueError, TypeError, RuntimeError) as e:
            logger.error(f"Failed to create context for SSE: {str(e)}")
            return jsonify({
                "error": f"Failed to create context: {str(e)}"
            }), 400
        
        logger.info(f"SSE connection established for context '{context_key}'")
        
        # Create a queue for flag updates
        update_queue = queue.Queue()
        
        # Flag to track if listener is registered
        listener_registered = False
        listener_fn = None
        
        def generate():
            """Generator function for SSE stream"""
            nonlocal listener_registered, listener_fn
            
            try:
                # Send initial flag value immediately
                default_value = "Hello from Python!"
                result = evaluate_flag("user-message", context, default_value)
                
                # Calculate hash value for bucketing demonstration
                try:
                    salt = get_flag_salt("user-message")
                    hash_info = calculate_hash_value("user-message", context_key, salt)
                    if hash_info:
                        result["hashInfo"] = hash_info
                        logger.debug(f"Calculated hash info: {hash_info}")
                except Exception as hash_error:
                    logger.error(f"Error calculating hash value: {str(hash_error)}")
                    result["hashInfo"] = None
                
                # Add timestamp to result
                result["timestamp"] = int(time.time())
                
                # Format for ServicePanel compatibility: use "message" field for flag value
                sse_data = {
                    "message": result["value"],
                    "hashInfo": result.get("hashInfo"),
                    "timestamp": result["timestamp"]
                }
                
                # Send as SSE data event
                yield f"data: {json.dumps(sse_data)}\n\n"
                logger.debug(f"Sent initial flag value to SSE client: {result['value']}")
                
                # Register flag change listener using flag_tracker API (available in SDK 9.1.0+)
                client = get_ld_client()
                
                if client and is_sdk_initialized():
                    try:
                        # Use flag_tracker.add_flag_value_change_listener for real-time updates
                        def flag_value_change_listener(flag_change):
                            """
                            Callback function for flag value changes.
                            
                            The Python SDK (9.1.0+) calls this when the flag value changes
                            for the specific context we're monitoring.
                            """
                            try:
                                logger.info(f"Flag '{flag_change.key}' changed from {flag_change.old_value} to {flag_change.new_value}")
                                
                                # Re-evaluate the flag to get full details
                                result = evaluate_flag("user-message", context, default_value)
                                
                                # Recalculate hash value
                                try:
                                    salt = get_flag_salt("user-message")
                                    hash_info = calculate_hash_value("user-message", context_key, salt)
                                    if hash_info:
                                        result["hashInfo"] = hash_info
                                except Exception as hash_error:
                                    logger.error(f"Error calculating hash value: {str(hash_error)}")
                                    result["hashInfo"] = None
                                
                                result["timestamp"] = int(time.time())
                                
                                # Format for ServicePanel compatibility
                                sse_data = {
                                    "message": result["value"],
                                    "hashInfo": result.get("hashInfo"),
                                    "timestamp": result["timestamp"]
                                }
                                
                                # Put update in queue for the generator to send
                                update_queue.put(sse_data)
                            except Exception as e:
                                logger.error(f"Error in flag value change listener: {str(e)}", exc_info=True)
                        
                        # Register the listener for the specific flag and context
                        listener_fn = client.flag_tracker.add_flag_value_change_listener(
                            'user-message',
                            context,
                            flag_value_change_listener
                        )
                        listener_registered = True
                        logger.info("Flag value change listener registered successfully")
                    except Exception as e:
                        logger.warning(f"Could not register flag value change listener: {str(e)}")
                        listener_registered = False
                else:
                    listener_registered = False
                
                # Keep connection alive with heartbeats
                last_heartbeat = time.time()
                heartbeat_interval = 15  # seconds
                
                while True:
                    current_time = time.time()
                    
                    # Check for flag updates in queue (non-blocking)
                    try:
                        update = update_queue.get(block=False)
                        yield f"data: {json.dumps(update)}\n\n"
                        logger.debug(f"Sent flag update to SSE client: {update['message']}")
                    except queue.Empty:
                        pass
                    
                    # Send heartbeat if interval has elapsed
                    if current_time - last_heartbeat >= heartbeat_interval:
                        yield ": heartbeat\n\n"
                        logger.debug("Sent heartbeat to SSE client")
                        last_heartbeat = current_time
                    
                    # Sleep before next iteration
                    time.sleep(1)
                    
            except GeneratorExit:
                # Client disconnected
                logger.info(f"SSE connection closed for context '{context_key}'")
            except Exception as e:
                # Handle any unexpected errors
                logger.error(f"Error in SSE generator: {str(e)}", exc_info=True)
                error_data = {
                    "error": "Stream error",
                    "message": str(e),
                    "timestamp": int(time.time())
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
        # Return SSE response with appropriate headers
        response = Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive'
            }
        )
        
        return response
        
    except Exception as e:
        # Handle any unexpected errors in setup
        logger.error(f"Error setting up SSE endpoint: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Failed to establish SSE connection",
            "message": str(e)
        }), 500


if __name__ == '__main__':
    # Development server (not used in production with Gunicorn)
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting Python application on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
