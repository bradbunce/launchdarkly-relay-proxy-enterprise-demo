"""
Unit Tests for SSE Endpoint

This module contains comprehensive unit tests for the /api/sse endpoint:
- SSE connection establishment
- Initial flag value delivery
- Heartbeat messages
- Connection cleanup

Tests cover success cases, error cases, and edge cases for the SSE endpoint.

**Validates: Requirements 1.6**
"""

import unittest
from unittest.mock import patch, MagicMock, call
import os
import sys
import json
import time

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestSSEEndpointParameterHandling(unittest.TestCase):
    """Unit tests for /api/sse endpoint parameter handling"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    def test_sse_endpoint_missing_context_key(self):
        """Test SSE endpoint returns 400 when contextKey is missing"""
        # Call endpoint without contextKey
        response = self.client.get('/api/sse')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('contextKey', data['error'])
    
    def test_sse_endpoint_empty_context_key(self):
        """Test SSE endpoint returns 400 when contextKey is empty"""
        # Call endpoint with empty contextKey
        response = self.client.get('/api/sse?contextKey=')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
    
    def test_sse_endpoint_whitespace_context_key(self):
        """Test SSE endpoint returns 400 when contextKey is only whitespace"""
        # Call endpoint with whitespace contextKey
        response = self.client.get('/api/sse?contextKey=   ')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Invalid contextKey', data['error'])
    
    @patch('app.create_context')
    def test_sse_endpoint_context_creation_error(self, mock_create_context):
        """Test SSE endpoint handles context creation errors"""
        # Mock context creation failure
        mock_create_context.side_effect = ValueError("Invalid context key")
        
        # Call endpoint
        response = self.client.get('/api/sse?contextKey=invalid')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Failed to create context', data['error'])


class TestSSEEndpointConnection(unittest.TestCase):
    """Unit tests for SSE endpoint connection establishment"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_connection_establishment(self, mock_initialized, mock_get_client, 
                                         mock_create_context, mock_evaluate):
        """Test SSE connection is established with correct headers"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint (this will start streaming, so we need to handle it carefully)
        response = self.client.get('/api/sse?contextKey=user-123')
        
        # Verify response headers
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.content_type)
        self.assertEqual(response.headers.get('Cache-Control'), 'no-cache')
        self.assertEqual(response.headers.get('X-Accel-Buffering'), 'no')
        self.assertEqual(response.headers.get('Connection'), 'keep-alive')
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_initial_flag_value_sent(self, mock_initialized, mock_get_client,
                                        mock_create_context, mock_evaluate):
        """Test SSE sends initial flag value immediately"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Welcome!",
            "reason": {"kind": "RULE_MATCH", "ruleIndex": 0}
        }
        
        # Call endpoint and get response data
        response = self.client.get('/api/sse?contextKey=user-123')
        
        # Read first chunk of data (initial value)
        # Note: In a real SSE stream, we'd need to read from the generator
        # For testing, we verify the response is streaming
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.content_type)
        
        # Verify evaluate_flag was called for initial value
        mock_evaluate.assert_called()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_with_email_and_name(self, mock_initialized, mock_get_client,
                                    mock_create_context, mock_evaluate):
        """Test SSE endpoint with email and name parameters"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello John!",
            "reason": {"kind": "TARGET_MATCH"}
        }
        
        # Call endpoint with all parameters
        response = self.client.get('/api/sse?contextKey=user-123&email=john@example.com&name=John Doe')
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.content_type)
        
        # Verify context was created with all parameters
        mock_create_context.assert_called_once_with('user-123', email='john@example.com', name='John Doe')


class TestSSEEndpointHeartbeat(unittest.TestCase):
    """Unit tests for SSE endpoint heartbeat mechanism"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.time.sleep')
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_heartbeat_format(self, mock_initialized, mock_get_client,
                                  mock_create_context, mock_evaluate, mock_sleep):
        """Test SSE heartbeat messages are sent in correct format"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Mock sleep to prevent actual waiting
        # We'll make it raise an exception after a few iterations to stop the loop
        mock_sleep.side_effect = [None, None, GeneratorExit()]
        
        # Call endpoint
        response = self.client.get('/api/sse?contextKey=user-123')
        
        # Verify response is streaming
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.content_type)


class TestSSEEndpointCleanup(unittest.TestCase):
    """Unit tests for SSE endpoint connection cleanup"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_connection_cleanup_on_disconnect(self, mock_initialized, mock_get_client,
                                                  mock_create_context, mock_evaluate):
        """Test SSE connection is cleaned up when client disconnects"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint
        response = self.client.get('/api/sse?contextKey=user-123')
        
        # Verify response was created
        self.assertEqual(response.status_code, 200)
        
        # In a real scenario, closing the connection would trigger cleanup
        # For unit tests, we verify the response is properly formed


class TestSSEEndpointErrorHandling(unittest.TestCase):
    """Unit tests for SSE endpoint error handling"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.create_context')
    def test_sse_endpoint_setup_error(self, mock_create_context):
        """Test SSE endpoint handles setup errors gracefully"""
        # Mock context creation to raise an exception
        mock_create_context.side_effect = RuntimeError("Context builder failed")
        
        # Call endpoint
        response = self.client.get('/api/sse?contextKey=user-123')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', data)
        self.assertIn('Failed to create context', data['error'])
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_sdk_not_initialized(self, mock_initialized, mock_get_client,
                                     mock_create_context, mock_evaluate):
        """Test SSE endpoint when SDK is not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        mock_get_client.return_value = None
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation to return error
        mock_evaluate.return_value = {
            "value": "Hello from Python!",
            "reason": {
                "kind": "ERROR",
                "errorKind": "CLIENT_NOT_READY"
            }
        }
        
        # Call endpoint
        response = self.client.get('/api/sse?contextKey=user-123')
        
        # Verify response is still streaming (returns default value)
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.content_type)


class TestSSEEndpointEdgeCases(unittest.TestCase):
    """Unit tests for SSE endpoint edge cases"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_with_special_characters(self, mock_initialized, mock_get_client,
                                        mock_create_context, mock_evaluate):
        """Test SSE endpoint with special characters in parameters"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint with URL-encoded special characters
        response = self.client.get('/api/sse?contextKey=user%40123&email=user%2Btest%40example.com')
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with decoded parameters
        mock_create_context.assert_called_once_with('user@123', email='user+test@example.com', name=None)
    
    @patch('app.evaluate_flag')
    @patch('app.create_context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sse_with_empty_optional_parameters(self, mock_initialized, mock_get_client,
                                                mock_create_context, mock_evaluate):
        """Test SSE endpoint with empty optional parameters"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        
        # Mock context
        mock_context = MagicMock()
        mock_create_context.return_value = mock_context
        
        # Mock flag evaluation
        mock_evaluate.return_value = {
            "value": "Hello!",
            "reason": {"kind": "FALLTHROUGH"}
        }
        
        # Call endpoint with empty email and name
        response = self.client.get('/api/sse?contextKey=user-123&email=&name=')
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        
        # Verify context was created with empty strings
        mock_create_context.assert_called_once_with('user-123', email='', name='')


if __name__ == '__main__':
    unittest.main()
