"""
Unit tests for /api/sdk-data-store endpoint

Tests the SDK data store endpoint that returns flag state information
from the SDK.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestSDKDataStoreEndpoint(unittest.TestCase):
    """Test cases for /api/sdk-data-store endpoint"""
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_returns_flags(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint returns flag state"""
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
        self.assertEqual(len(data['flags']), 2)
        
        # Verify flag data
        self.assertIn('user-message', data['flags'])
        self.assertEqual(data['flags']['user-message']['value'], 'Hello!')
        self.assertEqual(data['flags']['user-message']['version'], 5)
        self.assertEqual(data['flags']['user-message']['variation'], 0)
        
        self.assertIn('feature-flag-1', data['flags'])
        self.assertEqual(data['flags']['feature-flag-1']['value'], True)
        self.assertEqual(data['flags']['feature-flag-1']['version'], 3)
    
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
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_empty_state(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint with empty flag state"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with empty state
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "$flagsState": {},
            "$valid": True
        }
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['flags'], {})
        self.assertEqual(data['flagCount'], 0)
    
    @patch('ldclient.Context')
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_with_context_key(self, mock_initialized, mock_get_client, mock_context_class):
        """Test SDK data store endpoint with custom context key"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.kind.return_value = mock_builder
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Mock SDK client
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "user-message": "Custom message",
            "$flagsState": {
                "user-message": {
                    "version": 5,
                    "variation": 1,
                    "reason": {"kind": "RULE_MATCH", "ruleIndex": 0}
                }
            },
            "$valid": True
        }
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint with context key
        response = self.client.get('/api/sdk-data-store?contextKey=user-123')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(len(data['flags']), 1)
        
        # Verify context was created with custom key
        mock_context_class.builder.assert_called_once_with('user-123')
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_invalid_state(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint when state is invalid"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with invalid state
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = False
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', data)
        self.assertIn('not valid', data['error'])
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['flags'], {})
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_with_complex_flag_data(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint with complex flag state"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with complex state
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "complex-flag": "variation-b",
            "$flagsState": {
                "complex-flag": {
                    "version": 10,
                    "variation": 1,
                    "reason": {
                        "kind": "RULE_MATCH",
                        "ruleIndex": 0,
                        "ruleId": "rule-1"
                    }
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
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(len(data['flags']), 1)
        
        # Verify complex flag data
        flag = data['flags']['complex-flag']
        self.assertEqual(flag['value'], 'variation-b')
        self.assertEqual(flag['version'], 10)
        self.assertEqual(flag['variation'], 1)
        self.assertEqual(flag['reason']['kind'], 'RULE_MATCH')
        self.assertEqual(flag['reason']['ruleIndex'], 0)
        self.assertEqual(flag['reason']['ruleId'], 'rule-1')
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_all_flags_state_exception(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint handles all_flags_state exceptions"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client that raises exception
        mock_client = MagicMock()
        mock_client.all_flags_state.side_effect = Exception("Network error")
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', data)
        self.assertTrue(data['sdkInitialized'])
        self.assertEqual(data['flags'], {})
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_unexpected_exception(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint handles unexpected exceptions"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock get_client to raise exception
        mock_get_client.side_effect = Exception("Unexpected error")
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify error response
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', data)
        self.assertIn('Internal server error', data['error'])
        self.assertEqual(data['flags'], {})
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_flag_count(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint includes flag count"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with multiple flags
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        
        # Create state with 10 flags
        state_dict = {"$flagsState": {}, "$valid": True}
        for i in range(10):
            flag_key = f"flag-{i}"
            state_dict[flag_key] = True
            state_dict["$flagsState"][flag_key] = {
                "version": i,
                "variation": 0,
                "reason": {"kind": "FALLTHROUGH"}
            }
        
        mock_state.to_json_dict.return_value = state_dict
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify response
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['flagCount'], 10)
        self.assertEqual(len(data['flags']), 10)


class TestSDKDataStoreEdgeCases(unittest.TestCase):
    """Test edge cases for /api/sdk-data-store endpoint"""
    
    def setUp(self):
        """Set up test client"""
        import app
        self.app = app.app
        self.client = self.app.test_client()
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_with_null_flag_values(self, mock_initialized, mock_get_client):
        """Test SDK data store endpoint with null values in flag data"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client with null values
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "flag-with-null": None,
            "$flagsState": {
                "flag-with-null": {
                    "version": 1,
                    "variation": 0,
                    "reason": {"kind": "FALLTHROUGH"}
                }
            },
            "$valid": True
        }
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Call endpoint
        response = self.client.get('/api/sdk-data-store')
        data = response.get_json()
        
        # Verify response - should handle null values gracefully
        self.assertEqual(response.status_code, 200)
        self.assertIn('flag-with-null', data['flags'])
        self.assertIsNone(data['flags']['flag-with-null']['value'])
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_sdk_data_store_multiple_calls(self, mock_initialized, mock_get_client):
        """Test multiple calls to SDK data store endpoint"""
        # Mock SDK initialized
        mock_initialized.return_value = True
        
        # Mock SDK client
        mock_client = MagicMock()
        mock_state = MagicMock()
        mock_state.valid = True
        mock_state.to_json_dict.return_value = {
            "flag-1": True,
            "$flagsState": {
                "flag-1": {
                    "version": 1,
                    "variation": 0,
                    "reason": {"kind": "FALLTHROUGH"}
                }
            },
            "$valid": True
        }
        
        mock_client.all_flags_state.return_value = mock_state
        mock_get_client.return_value = mock_client
        
        # Make multiple calls
        for i in range(5):
            response = self.client.get('/api/sdk-data-store')
            self.assertEqual(response.status_code, 200)
        
        # Verify all calls succeeded
        self.assertEqual(mock_client.all_flags_state.call_count, 5)


if __name__ == '__main__':
    unittest.main()
