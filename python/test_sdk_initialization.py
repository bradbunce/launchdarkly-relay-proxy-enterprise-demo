"""
Unit tests for LaunchDarkly SDK initialization

Tests the SDK initialization, singleton pattern, error handling, and logging.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class TestSDKInitialization(unittest.TestCase):
    """Test cases for SDK initialization functionality"""
    
    def setUp(self):
        """Reset global state before each test"""
        # Import app module fresh for each test
        import app
        self.app_module = app
        
        # Reset global variables
        app._ld_client = None
        app._sdk_initialized = False
        app._sdk_initialization_error = None
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {'LAUNCHDARKLY_SDK_KEY': 'test-sdk-key'})
    def test_successful_initialization(self, mock_ldclient):
        """Test successful SDK initialization with valid credentials"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_client.is_initialized.return_value = True
        mock_ldclient.get.return_value = mock_client
        mock_ldclient.VERSION = '9.0.0'
        
        # Initialize SDK
        result = self.app_module.initialize_launchdarkly_sdk()
        
        # Verify initialization succeeded
        self.assertTrue(result)
        self.assertTrue(self.app_module.is_sdk_initialized())
        self.assertEqual(self.app_module.get_sdk_connection_state(), 'VALID')
        self.assertIsNone(self.app_module.get_sdk_initialization_error())
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_sdk_key(self, mock_ldclient):
        """Test SDK initialization fails gracefully when SDK key is missing"""
        # Initialize SDK without SDK key
        result = self.app_module.initialize_launchdarkly_sdk()
        
        # Verify initialization failed
        self.assertFalse(result)
        self.assertFalse(self.app_module.is_sdk_initialized())
        self.assertEqual(self.app_module.get_sdk_connection_state(), 'OFF')
        self.assertIsNotNone(self.app_module.get_sdk_initialization_error())
        self.assertIn('LAUNCHDARKLY_SDK_KEY', self.app_module.get_sdk_initialization_error())
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {'LAUNCHDARKLY_SDK_KEY': 'test-sdk-key'})
    def test_initialization_timeout(self, mock_ldclient):
        """Test SDK initialization handles timeout gracefully"""
        # Mock SDK client that never initializes
        mock_client = MagicMock()
        mock_client.is_initialized.return_value = False
        mock_ldclient.get.return_value = mock_client
        
        # Initialize SDK (should timeout)
        result = self.app_module.initialize_launchdarkly_sdk()
        
        # Verify initialization failed with timeout
        self.assertFalse(result)
        self.assertFalse(self.app_module.is_sdk_initialized())
        self.assertEqual(self.app_module.get_sdk_connection_state(), 'OFF')
        self.assertIsNotNone(self.app_module.get_sdk_initialization_error())
        self.assertIn('timed out', self.app_module.get_sdk_initialization_error().lower())
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {'LAUNCHDARKLY_SDK_KEY': 'test-sdk-key'})
    def test_initialization_exception(self, mock_ldclient):
        """Test SDK initialization handles exceptions gracefully"""
        # Mock SDK to raise exception
        mock_ldclient.set_config.side_effect = Exception('Network error')
        
        # Initialize SDK (should catch exception)
        result = self.app_module.initialize_launchdarkly_sdk()
        
        # Verify initialization failed with error
        self.assertFalse(result)
        self.assertFalse(self.app_module.is_sdk_initialized())
        self.assertEqual(self.app_module.get_sdk_connection_state(), 'OFF')
        self.assertIsNotNone(self.app_module.get_sdk_initialization_error())
        self.assertIn('Network error', self.app_module.get_sdk_initialization_error())
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {'LAUNCHDARKLY_SDK_KEY': 'test-sdk-key'})
    def test_singleton_pattern(self, mock_ldclient):
        """Test SDK client follows singleton pattern"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_client.is_initialized.return_value = True
        mock_ldclient.get.return_value = mock_client
        
        # Initialize SDK twice
        result1 = self.app_module.initialize_launchdarkly_sdk()
        client1 = self.app_module.get_ld_client()
        
        result2 = self.app_module.initialize_launchdarkly_sdk()
        client2 = self.app_module.get_ld_client()
        
        # Verify both calls succeeded and returned same client
        self.assertTrue(result1)
        self.assertTrue(result2)
        self.assertIs(client1, client2)
    
    @patch('app.ldclient')
    @patch.dict(os.environ, {'LAUNCHDARKLY_SDK_KEY': 'test-sdk-key'})
    def test_connection_state_initializing(self, mock_ldclient):
        """Test connection state returns INITIALIZING when SDK is not ready"""
        # Mock SDK client that is not initialized
        mock_client = MagicMock()
        mock_client.is_initialized.return_value = False
        mock_ldclient.get.return_value = mock_client
        
        # Set SDK as initialized but client not ready
        self.app_module._sdk_initialized = True
        self.app_module._ld_client = mock_client
        
        # Check connection state
        state = self.app_module.get_sdk_connection_state()
        
        # Verify state is INITIALIZING
        self.assertEqual(state, 'INITIALIZING')


class TestStatusEndpoint(unittest.TestCase):
    """Test cases for the /api/status endpoint"""
    
    def setUp(self):
        """Set up test client"""
        import app
        self.app = app.app
        self.client = self.app.test_client()
        self.app_module = app
    
    @patch('app.is_sdk_initialized')
    @patch('app.get_sdk_connection_state')
    @patch('app.ldclient')
    def test_status_endpoint_success(self, mock_ldclient, mock_state, mock_initialized):
        """Test status endpoint returns correct data when SDK is initialized"""
        # Mock SDK state
        mock_initialized.return_value = True
        mock_state.return_value = 'VALID'
        mock_ldclient.VERSION = '9.0.0'
        
        # Call status endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['connected'])
        self.assertEqual(data['mode'], 'default')
        self.assertEqual(data['sdkVersion'], '9.0.0')
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['connectionState'], 'VALID')
    
    @patch('app.is_sdk_initialized')
    @patch('app.get_sdk_connection_state')
    @patch('app._sdk_initialization_error', 'SDK key missing')
    def test_status_endpoint_not_initialized(self, mock_state, mock_initialized):
        """Test status endpoint returns error when SDK is not initialized"""
        # Mock SDK state
        mock_initialized.return_value = False
        mock_state.return_value = 'OFF'
        
        # Call status endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertFalse(data['connected'])
        self.assertEqual(data['mode'], 'default')
        self.assertEqual(data['sdkVersion'], 'not-initialized')
        self.assertFalse(data['sdkInitialized'])
        self.assertEqual(data['connectionState'], 'OFF')
        self.assertIn('error', data)


class TestHealthEndpoint(unittest.TestCase):
    """Test cases for the /health endpoint"""
    
    def setUp(self):
        """Set up test client"""
        import app
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.is_sdk_initialized')
    def test_health_endpoint_healthy(self, mock_initialized):
        """Test health endpoint returns healthy when SDK is initialized"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Call health endpoint
        response = self.client.get('/health')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['status'], 'healthy')
        self.assertTrue(data['sdkInitialized'])
    
    @patch('app.is_sdk_initialized')
    @patch('app._sdk_initialization_error', 'Connection failed')
    def test_health_endpoint_unhealthy(self, mock_initialized):
        """Test health endpoint returns unhealthy when SDK is not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        
        # Call health endpoint
        response = self.client.get('/health')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 503)
        self.assertEqual(data['status'], 'unhealthy')
        self.assertFalse(data['sdkInitialized'])
        self.assertIn('error', data)


if __name__ == '__main__':
    unittest.main()
