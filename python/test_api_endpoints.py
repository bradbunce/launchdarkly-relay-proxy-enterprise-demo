"""
Unit Tests for API Endpoints

This module contains comprehensive unit tests for all Python service API endpoints:
- /api/status - SDK status and connection information
- /api/flag - Feature flag evaluation
- /health - Health check endpoint
- /api/sdk-data-store - SDK data store information

Tests cover success cases, error cases, and edge cases for each endpoint.

**Validates: Requirements 1.6, 6.1, 6.2, 6.3**
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestStatusEndpoint(unittest.TestCase):
    """Unit tests for /api/status endpoint"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.get_sdk_connection_state')
    @patch('app.is_sdk_initialized')
    @patch('app.ldclient.VERSION', '9.0.0')
    def test_status_endpoint_sdk_initialized(self, mock_initialized, mock_state):
        """Test status endpoint when SDK is initialized and connected"""
        # Mock SDK initialized and connected
        mock_initialized.return_value = True
        mock_state.return_value = 'VALID'
        
        # Call endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['connected'])
        self.assertEqual(data['mode'], 'default')
        self.assertEqual(data['sdkVersion'], '9.0.0')
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['connectionState'], 'VALID')
        self.assertNotIn('error', data)
    
    @patch('app.get_sdk_connection_state')
    @patch('app.is_sdk_initialized')
    @patch('app._sdk_initialization_error', 'SDK key not found')
    def test_status_endpoint_sdk_not_initialized(self, mock_initialized, mock_state):
        """Test status endpoint when SDK is not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        mock_state.return_value = 'OFF'
        
        # Call endpoint
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
        self.assertEqual(data['error'], 'SDK key not found')
    
    @patch('app.get_sdk_connection_state')
    @patch('app.is_sdk_initialized')
    @patch('app.ldclient.VERSION', '9.0.0')
    def test_status_endpoint_sdk_initializing(self, mock_initialized, mock_state):
        """Test status endpoint when SDK is initializing"""
        # Mock SDK initializing
        mock_initialized.return_value = False
        mock_state.return_value = 'INITIALIZING'
        
        # Call endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertFalse(data['connected'])
        self.assertEqual(data['connectionState'], 'INITIALIZING')
        self.assertFalse(data['sdkInitialized'])
    
    @patch('app.get_sdk_connection_state')
    @patch('app.is_sdk_initialized')
    @patch('app.ldclient.VERSION', '9.0.0')
    def test_status_endpoint_sdk_interrupted(self, mock_initialized, mock_state):
        """Test status endpoint when SDK connection is interrupted"""
        # Mock SDK initialized but connection interrupted
        mock_initialized.return_value = True
        mock_state.return_value = 'INTERRUPTED'
        
        # Call endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertFalse(data['connected'])  # Not connected when interrupted
        self.assertEqual(data['connectionState'], 'INTERRUPTED')
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['sdkVersion'], '9.0.0')
    
    @patch('app.get_sdk_connection_state')
    def test_status_endpoint_exception_handling(self, mock_state):
        """Test status endpoint handles exceptions gracefully"""
        # Mock exception in get_sdk_connection_state
        mock_state.side_effect = Exception("Unexpected error")
        
        # Call endpoint
        response = self.client.get('/api/status')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 500)
        self.assertFalse(data['connected'])
        self.assertEqual(data['mode'], 'default')
        self.assertEqual(data['sdkVersion'], 'error')
        self.assertFalse(data['sdkInitialized'])
        self.assertEqual(data['connectionState'], 'OFF')
        self.assertIn('error', data)


class TestHealthEndpoint(unittest.TestCase):
    """Unit tests for /health endpoint"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.is_sdk_initialized')
    def test_health_endpoint_healthy(self, mock_initialized):
        """Test health endpoint when SDK is initialized (healthy)"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Call endpoint
        response = self.client.get('/health')
        data = response.get_json()
        
        # Verify healthy response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['status'], 'healthy')
        self.assertEqual(data['service'], 'python-app-dev')
        self.assertTrue(data['sdkInitialized'])
        self.assertNotIn('error', data)
    
    @patch('app.is_sdk_initialized')
    @patch('app._sdk_initialization_error', 'Connection timeout')
    def test_health_endpoint_unhealthy(self, mock_initialized):
        """Test health endpoint when SDK is not initialized (unhealthy)"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        
        # Call endpoint
        response = self.client.get('/health')
        data = response.get_json()
        
        # Verify unhealthy response
        self.assertEqual(response.status_code, 503)
        self.assertEqual(data['status'], 'unhealthy')
        self.assertEqual(data['service'], 'python-app-dev')
        self.assertFalse(data['sdkInitialized'])
        self.assertIn('error', data)
        self.assertEqual(data['error'], 'Connection timeout')
    
    @patch('app.is_sdk_initialized')
    def test_health_endpoint_multiple_calls(self, mock_initialized):
        """Test multiple calls to health endpoint"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Make multiple calls
        for _ in range(5):
            response = self.client.get('/health')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertEqual(data['status'], 'healthy')


class TestFlagEndpointParameterHandling(unittest.TestCase):
    """Unit tests for /api/flag endpoint parameter handling"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    def test_flag_endpoint_missing_context_key(self):
        """Test flag endpoint returns 400 when contextKey is missing"""
        # Call endpoint without contextKey
        response = self.client.get('/api/flag')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('contextKey', data['error'])
        self.assertEqual(data['value'], 'Hello from Python!')
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'MISSING_PARAMETER')
    
    def test_flag_endpoint_empty_context_key(self):
        """Test flag endpoint returns 400 when contextKey is empty"""
        # Call endpoint with empty contextKey
        response = self.client.get('/api/flag?contextKey=')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'MISSING_PARAMETER')
    
    def test_flag_endpoint_whitespace_context_key(self):
        """Test flag endpoint returns 400 when contextKey is only whitespace"""
        # Call endpoint with whitespace contextKey
        response = self.client.get('/api/flag?contextKey=   ')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Invalid contextKey', data['error'])
        self.assertEqual(data['reason']['errorKind'], 'INVALID_PARAMETER')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_only_context_key(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with only contextKey parameter"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Hello!')
        
        # Verify context created with None for optional params
        mock_create_context.assert_called_once_with('user-123', email=None, name=None)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_email(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with contextKey and email"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Welcome!",
            "reason": {"kind": "RULE_MATCH", "ruleIndex": 0}
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=user@example.com')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Welcome!')
        
        # Verify context created with email
        mock_create_context.assert_called_once_with('user-123', email='user@example.com', name=None)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_name(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with contextKey and name"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Hello John!",
            "reason": {"kind": "TARGET_MATCH"}
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&name=John Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Hello John!')
        
        # Verify context created with name
        mock_create_context.assert_called_once_with('user-123', email=None, name='John Doe')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_all_parameters(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with all parameters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "VIP message",
            "reason": {"kind": "RULE_MATCH", "ruleIndex": 1, "ruleId": "vip-rule"}
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=user@example.com&name=John Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'VIP message')
        self.assertEqual(data['reason']['ruleIndex'], 1)
        self.assertEqual(data['reason']['ruleId'], 'vip-rule')
        
        # Verify context created with all attributes
        mock_create_context.assert_called_once_with('user-123', email='user@example.com', name='John Doe')


class TestFlagEndpointErrorHandling(unittest.TestCase):
    """Unit tests for /api/flag endpoint error handling"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.create_context')
    def test_flag_endpoint_context_creation_value_error(self, mock_create_context):
        """Test flag endpoint handles ValueError from context creation"""
        # Mock context creation failure
        mock_create_context.side_effect = ValueError("Invalid context key format")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=invalid')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Failed to create context', data['error'])
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'CONTEXT_CREATION_FAILED')
    
    @patch('app.create_context')
    def test_flag_endpoint_context_creation_type_error(self, mock_create_context):
        """Test flag endpoint handles TypeError from context creation"""
        # Mock context creation failure
        mock_create_context.side_effect = TypeError("email must be a string")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=123')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Failed to create context', data['error'])
        self.assertEqual(data['reason']['errorKind'], 'CONTEXT_CREATION_FAILED')
    
    @patch('app.create_context')
    def test_flag_endpoint_context_creation_runtime_error(self, mock_create_context):
        """Test flag endpoint handles RuntimeError from context creation"""
        # Mock context creation failure
        mock_create_context.side_effect = RuntimeError("Context builder failed")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertEqual(data['reason']['errorKind'], 'CONTEXT_CREATION_FAILED')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_sdk_not_initialized(self, mock_create_context, mock_evaluate):
        """Test flag endpoint when SDK is not initialized"""
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock evaluation with SDK not ready error
        mock_evaluate.return_value = {
            "value": "Hello from Python!",
            "reason": {
                "kind": "ERROR",
                "errorKind": "CLIENT_NOT_READY"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123')
        data = response.get_json()
        
        # Verify response returns default value
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Hello from Python!')
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'CLIENT_NOT_READY')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_evaluation_exception(self, mock_create_context, mock_evaluate):
        """Test flag endpoint handles evaluation exceptions"""
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock evaluation exception
        mock_evaluate.side_effect = Exception("Network error")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', data)
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'INTERNAL_ERROR')


class TestFlagEndpointEdgeCases(unittest.TestCase):
    """Unit tests for /api/flag endpoint edge cases"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_special_characters(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with special characters in parameters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint with URL-encoded special characters
        response = self.client.get('/api/flag?contextKey=user%40123&email=user%2Btest%40example.com')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with decoded parameters
        mock_create_context.assert_called_once_with('user@123', email='user+test@example.com', name=None)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_empty_optional_parameters(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with empty optional parameters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint with empty email and name
        response = self.client.get('/api/flag?contextKey=user-123&email=&name=')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with empty strings
        mock_create_context.assert_called_once_with('user-123', email='', name='')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_very_long_context_key(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with very long context key"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Create very long context key
        long_key = "a" * 1000
        
        # Call endpoint
        response = self.client.get(f'/api/flag?contextKey={long_key}')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with long key
        mock_create_context.assert_called_once_with(long_key, email=None, name=None)


class TestSDKDataStoreEndpoint(unittest.TestCase):
    """Unit tests for /api/sdk-data-store endpoint"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_sdk_initialized(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint when SDK is initialized"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with all_flags_state
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "user-message": "Hello!",
            "feature-flag-1": True,
            "$flagsState": {
                "user-message": {
                    "version": 5,
                    "variation": 0,
                    "reason": {"kind": "FALLTHROUGH"}
                },
                "feature-flag-1": {
                    "version": 3,
                    "variation": 0,
                    "reason": {"kind": "OFF"}
                }
            },
            "$valid": True
        }
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertIn('flags', data)
        self.assertIn('sdkInitialized', data)
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['flagCount'], 2)
        
        # Verify flag data
        self.assertIn('user-message', data['flags'])
        self.assertEqual(data['flags']['user-message']['value'], 'Hello!')
        self.assertEqual(data['flags']['user-message']['version'], 5)
    
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_sdk_not_initialized(self, mock_initialized):
        """Test SDK data store endpoint when SDK is not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', data)
        self.assertIn('SDK not initialized', data['error'])
        self.assertFalse(data['sdkInitialized'])
        self.assertEqual(data['flags'], {})
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_client_is_none(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint when client is None"""
        # Mock SDK initialized but client is None
        mock_initialized.return_value = True
        mock_get_client.return_value = None
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', data)
        self.assertIn('SDK client not available', data['error'])
        self.assertFalse(data['sdkInitialized'])
        self.assertEqual(data['flags'], {})


class TestEndpointIntegration(unittest.TestCase):
    """Integration tests for API endpoints"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.is_sdk_initialized')
    @patch('app.get_sdk_connection_state')
    @patch('app.ldclient.VERSION', '9.0.0')
    def test_status_and_health_consistency(self, mock_state, mock_initialized):
        """Test that status and health endpoints are consistent"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_state.return_value = 'VALID'
        
        # Call both endpoints
        status_response = self.client.get('/api/status')
        health_response = self.client.get('/health')
        
        status_data = status_response.get_json()
        health_data = health_response.get_json()
        
        # Verify consistency
        self.assertEqual(status_data['sdkInitialized'], health_data['sdkInitialized'])
        self.assertTrue(status_data['connected'])
        self.assertEqual(health_data['status'], 'healthy')
    
    @patch('app.is_sdk_initialized')
    @patch('app.get_sdk_connection_state')
    def test_status_and_health_consistency_when_not_initialized(self, mock_state, mock_initialized):
        """Test that status and health endpoints are consistent when SDK not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        mock_state.return_value = 'OFF'
        
        # Call both endpoints
        status_response = self.client.get('/api/status')
        health_response = self.client.get('/health')
        
        status_data = status_response.get_json()
        health_data = health_response.get_json()
        
        # Verify consistency
        self.assertEqual(status_data['sdkInitialized'], health_data['sdkInitialized'])
        self.assertFalse(status_data['connected'])
        self.assertEqual(health_data['status'], 'unhealthy')
        self.assertEqual(health_response.status_code, 503)


if __name__ == '__main__':
    unittest.main()
