"""
Unit tests for flag evaluation logic

Tests the evaluate_flag() function, error handling, and evaluation reasons.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestEvaluateFlag(unittest.TestCase):
    """Test cases for evaluate_flag() function"""
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_success(self, mock_initialized, mock_get_client):
        """Test successful flag evaluation with rule match"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with reason as dict (like real Python SDK)
        mock_detail = MagicMock()
        mock_detail.value = "Welcome back!"
        mock_detail.reason = {
            "kind": "RULE_MATCH",
            "ruleIndex": 0,
            "ruleId": "rule-123"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify result
        self.assertEqual(result["value"], "Welcome back!")
        self.assertEqual(result["reason"]["kind"], "RULE_MATCH")
        self.assertEqual(result["reason"]["ruleIndex"], 0)
        self.assertEqual(result["reason"]["ruleId"], "rule-123")
        
        # Verify SDK was called correctly
        mock_client.variation_detail.assert_called_once_with(
            "user-message", mock_context, "Hello!"
        )
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_fallthrough(self, mock_initialized, mock_get_client):
        """Test flag evaluation with fallthrough reason"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with fallthrough (reason as dict)
        mock_detail = MagicMock()
        mock_detail.value = "Default message"
        mock_detail.reason = {
            "kind": "FALLTHROUGH"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify result
        self.assertEqual(result["value"], "Default message")
        self.assertEqual(result["reason"]["kind"], "FALLTHROUGH")
        self.assertNotIn("ruleIndex", result["reason"])
        self.assertNotIn("ruleId", result["reason"])
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_target_match(self, mock_initialized, mock_get_client):
        """Test flag evaluation with target match reason"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with target match (reason as dict)
        mock_detail = MagicMock()
        mock_detail.value = "VIP message"
        mock_detail.reason = {
            "kind": "TARGET_MATCH"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify result
        self.assertEqual(result["value"], "VIP message")
        self.assertEqual(result["reason"]["kind"], "TARGET_MATCH")
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_sdk_not_initialized(self, mock_initialized, mock_get_client):
        """Test flag evaluation when SDK is not initialized"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        mock_get_client.return_value = None
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify default value is returned with error reason
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "ERROR")
        self.assertEqual(result["reason"]["errorKind"], "CLIENT_NOT_READY")
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_client_is_none(self, mock_initialized, mock_get_client):
        """Test flag evaluation when client is None"""
        # Mock SDK initialized but client is None
        mock_initialized.return_value = True
        mock_get_client.return_value = None
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify default value is returned with error reason
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "ERROR")
        self.assertEqual(result["reason"]["errorKind"], "CLIENT_NOT_READY")
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_exception_handling(self, mock_initialized, mock_get_client):
        """Test flag evaluation handles exceptions gracefully"""
        # Mock SDK client that raises exception
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        mock_client.variation_detail.side_effect = Exception("Network error")
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify default value is returned with error reason
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "ERROR")
        self.assertEqual(result["reason"]["errorKind"], "EXCEPTION")
        self.assertIn("Network error", result["reason"]["errorMessage"])
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_different_types(self, mock_initialized, mock_get_client):
        """Test flag evaluation with different value types"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Create context
        mock_context = MagicMock()
        
        # Test with boolean flag
        mock_detail = MagicMock()
        mock_detail.value = True
        mock_detail.reason = {"kind": "FALLTHROUGH"}
        mock_client.variation_detail.return_value = mock_detail
        
        result = app.evaluate_flag("feature-enabled", mock_context, False)
        self.assertEqual(result["value"], True)
        
        # Test with integer flag
        mock_detail.value = 42
        result = app.evaluate_flag("max-items", mock_context, 10)
        self.assertEqual(result["value"], 42)
        
        # Test with JSON flag
        mock_detail.value = {"key": "value"}
        result = app.evaluate_flag("config", mock_context, {})
        self.assertEqual(result["value"], {"key": "value"})
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_error_kind(self, mock_initialized, mock_get_client):
        """Test flag evaluation with error kind in reason"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with error (reason as dict)
        mock_detail = MagicMock()
        mock_detail.value = "Hello!"
        mock_detail.reason = {
            "kind": "ERROR",
            "errorKind": "FLAG_NOT_FOUND"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("unknown-flag", mock_context, "Hello!")
        
        # Verify result includes error kind
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "ERROR")
        self.assertEqual(result["reason"]["errorKind"], "FLAG_NOT_FOUND")
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_missing_reason_attributes(self, mock_initialized, mock_get_client):
        """Test flag evaluation handles missing reason attributes gracefully"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with minimal reason (dict with only kind)
        mock_detail = MagicMock()
        mock_detail.value = "Hello!"
        mock_detail.reason = {
            "kind": "FALLTHROUGH"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify result doesn't include None attributes
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "FALLTHROUGH")
        self.assertNotIn("ruleIndex", result["reason"])
        self.assertNotIn("ruleId", result["reason"])
        self.assertNotIn("errorKind", result["reason"])
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_none_reason(self, mock_initialized, mock_get_client):
        """Test flag evaluation handles None reason gracefully"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with None reason
        mock_detail = MagicMock()
        mock_detail.value = "Hello!"
        mock_detail.reason = {}  # Empty dict instead of None
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag
        result = app.evaluate_flag("user-message", mock_context, "Hello!")
        
        # Verify result has UNKNOWN kind
        self.assertEqual(result["value"], "Hello!")
        self.assertEqual(result["reason"]["kind"], "UNKNOWN")


class TestEvaluateFlagEdgeCases(unittest.TestCase):
    """Test edge cases for flag evaluation"""
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_empty_flag_key(self, mock_initialized, mock_get_client):
        """Test flag evaluation with empty flag key"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail
        mock_detail = MagicMock()
        mock_detail.value = "default"
        mock_detail.reason = MagicMock()
        mock_detail.reason.kind = "ERROR"
        mock_detail.reason.error_kind = "FLAG_NOT_FOUND"
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag with empty key
        result = app.evaluate_flag("", mock_context, "default")
        
        # Verify SDK was called (it will handle the empty key)
        mock_client.variation_detail.assert_called_once()
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_none_default_value(self, mock_initialized, mock_get_client):
        """Test flag evaluation with None as default value"""
        # Mock SDK client
        mock_client = MagicMock()
        mock_initialized.return_value = True
        mock_get_client.return_value = mock_client
        
        # Mock evaluation detail with reason as dict
        mock_detail = MagicMock()
        mock_detail.value = None
        mock_detail.reason = {
            "kind": "FALLTHROUGH"
        }
        
        mock_client.variation_detail.return_value = mock_detail
        
        # Create context
        mock_context = MagicMock()
        
        # Evaluate flag with None default
        result = app.evaluate_flag("user-message", mock_context, None)
        
        # Verify None is handled correctly
        self.assertIsNone(result["value"])
        self.assertEqual(result["reason"]["kind"], "FALLTHROUGH")
    
    @patch('app.get_ld_client')
    @patch('app.is_sdk_initialized')
    def test_evaluate_flag_with_complex_default_value(self, mock_initialized, mock_get_client):
        """Test flag evaluation with complex default value"""
        # Mock SDK not initialized
        mock_initialized.return_value = False
        mock_get_client.return_value = None
        
        # Create context
        mock_context = MagicMock()
        
        # Complex default value
        default = {
            "message": "Hello!",
            "settings": {
                "enabled": True,
                "count": 5
            }
        }
        
        # Evaluate flag
        result = app.evaluate_flag("config", mock_context, default)
        
        # Verify complex default is returned
        self.assertEqual(result["value"], default)
        self.assertEqual(result["reason"]["kind"], "ERROR")


if __name__ == '__main__':
    unittest.main()
