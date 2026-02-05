"""
Unit tests for /api/flag endpoint

Tests the flag evaluation endpoint with various query parameters,
error handling, and edge cases.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestFlagEndpoint(unittest.TestCase):
    """Test cases for /api/flag endpoint"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_context_key_only(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with only contextKey parameter"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "Welcome!",
            "reason": {
                "kind": "FALLTHROUGH"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Welcome!')
        self.assertEqual(data['reason']['kind'], 'FALLTHROUGH')
        
        # Verify context was created correctly
        mock_create_context.assert_called_once_with('user-123', email=None, name=None)
        
        # Verify flag was evaluated
        mock_evaluate.assert_called_once_with('user-message', mock_context, 'Hello from Python!')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_email(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with contextKey and email parameters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "Welcome back!",
            "reason": {
                "kind": "RULE_MATCH",
                "ruleIndex": 0,
                "ruleId": "rule-123"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=user@example.com')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Welcome back!')
        self.assertEqual(data['reason']['kind'], 'RULE_MATCH')
        self.assertEqual(data['reason']['ruleIndex'], 0)
        self.assertEqual(data['reason']['ruleId'], 'rule-123')
        
        # Verify context was created with email
        mock_create_context.assert_called_once_with('user-123', email='user@example.com', name=None)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_name(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with contextKey and name parameters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "Hello John!",
            "reason": {
                "kind": "TARGET_MATCH"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&name=John Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Hello John!')
        self.assertEqual(data['reason']['kind'], 'TARGET_MATCH')
        
        # Verify context was created with name
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
            "reason": {
                "kind": "RULE_MATCH",
                "ruleIndex": 1,
                "ruleId": "vip-rule"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=user@example.com&name=John Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'VIP message')
        self.assertEqual(data['reason']['kind'], 'RULE_MATCH')
        
        # Verify context was created with all attributes
        mock_create_context.assert_called_once_with('user-123', email='user@example.com', name='John Doe')
    
    def test_flag_endpoint_missing_context_key(self):
        """Test flag endpoint returns error when contextKey is missing"""
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
        """Test flag endpoint returns error when contextKey is empty"""
        # Call endpoint with empty contextKey
        response = self.client.get('/api/flag?contextKey=')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('contextKey', data['error'])
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'MISSING_PARAMETER')
    
    @patch('app.validate_context_key')
    def test_flag_endpoint_invalid_context_key(self, mock_validate):
        """Test flag endpoint returns error when contextKey is invalid"""
        # Mock validation failure
        mock_validate.return_value = (False, "context_key cannot be empty")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=invalid')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Invalid contextKey', data['error'])
        self.assertEqual(data['reason']['kind'], 'ERROR')
        self.assertEqual(data['reason']['errorKind'], 'INVALID_PARAMETER')
    
    @patch('app.create_context')
    def test_flag_endpoint_context_creation_error(self, mock_create_context):
        """Test flag endpoint handles context creation errors"""
        # Mock context creation failure
        mock_create_context.side_effect = ValueError("Invalid email format")
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=invalid')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Failed to create context', data['error'])
        self.assertEqual(data['reason']['kind'], 'ERROR')
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
    """Test edge cases for /api/flag endpoint"""
    
    def setUp(self):
        """Set up test client"""
        import app
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
        
        # Call endpoint with special characters
        response = self.client.get('/api/flag?contextKey=user%40123&email=user%2Btest%40example.com&name=John%20Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with decoded parameters
        mock_create_context.assert_called_once_with('user@123', email='user+test@example.com', name='John Doe')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_unicode_characters(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with unicode characters"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "¡Hola!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint with unicode
        response = self.client.get('/api/flag?contextKey=user-123&name=José García')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], '¡Hola!')
    
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
        
        # Verify context was created with empty strings (will be handled by create_context)
        mock_create_context.assert_called_once_with('user-123', email='', name='')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_with_very_long_parameters(self, mock_create_context, mock_evaluate):
        """Test flag endpoint with very long parameter values"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Create very long values
        long_key = "a" * 1000
        long_email = "user@" + "a" * 1000 + ".com"
        long_name = "b" * 1000
        
        # Call endpoint
        response = self.client.get(f'/api/flag?contextKey={long_key}&email={long_email}&name={long_name}')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with long values
        mock_create_context.assert_called_once_with(long_key, email=long_email, name=long_name)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    def test_flag_endpoint_multiple_calls(self, mock_create_context, mock_evaluate):
        """Test multiple calls to flag endpoint"""
        # Mock context and evaluation
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Make multiple calls
        for i in range(5):
            response = self.client.get(f'/api/flag?contextKey=user-{i}')
            self.assertEqual(response.status_code, 200)
        
        # Verify all calls succeeded
        self.assertEqual(mock_create_context.call_count, 5)
        self.assertEqual(mock_evaluate.call_count, 5)


class TestFlagEndpointIntegration(unittest.TestCase):
    """Integration tests for /api/flag endpoint with real functions"""
    
    def setUp(self):
        """Set up test client"""
        import app
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('ldclient.Context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_flag_endpoint_full_flow(self, mock_initialized, mock_get_client, mock_context_class):
        """Test complete flow from endpoint to SDK evaluation"""
        # Mock Context builder to return a simple dict-like object
        mock_builder = MagicMock()
        mock_context = {'kind': 'user', 'key': 'user-123', 'email': 'user@example.com', 'name': 'John Doe'}
        mock_builder.build.return_value = mock_context
        mock_builder.kind.return_value = mock_builder
        mock_builder.set.return_value = mock_builder
        mock_context_class.builder.return_value = mock_builder
        
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with reason as a dict (like the real Python SDK)
        mock_detail = MagicMock()
        mock_detail.value = "Welcome back!"
        mock_detail.reason = {
            "kind": "RULE_MATCH",
            "ruleIndex": 0,
            "ruleId": "rule-123"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Call endpoint
        response = self.client.get('/api/flag?contextKey=user-123&email=user@example.com&name=John Doe')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['value'], 'Welcome back!')
        self.assertEqual(data['reason']['kind'], 'RULE_MATCH')
        self.assertEqual(data['reason']['ruleIndex'], 0)
        self.assertEqual(data['reason']['ruleId'], 'rule-123')
        
        # Verify SDK was called
        mock_client.variation_detail.assert_called_once()
        call_args = mock_client.variation_detail.call_args
        self.assertEqual(call_args[0][0], 'user-message')  # flag key
        self.assertEqual(call_args[0][2], 'Hello from Python!')  # default value


if __name__ == '__main__':
    unittest.main()
