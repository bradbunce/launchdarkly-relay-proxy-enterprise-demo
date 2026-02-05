"""
Unit tests for LaunchDarkly context creation and management

Tests the create_context() function, validation logic, and error handling.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestCreateContext(unittest.TestCase):
    """Test cases for create_context() function"""
    
    @patch('ldclient.Context')
    def test_create_context_with_key_only(self, mock_context_class):
        """Test creating a context with only a key"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context
        result = app.create_context("user-123")
        
        # Verify builder was called correctly
        mock_context_class.builder.assert_called_once_with("user-123")
        mock_builder.kind.assert_called_once_with("user")
        mock_builder.build.assert_called_once()
        
        # Verify email and name were not set
        mock_builder.set.assert_not_called()
        
        # Verify result
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_with_email(self, mock_context_class):
        """Test creating a context with key and email"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context
        result = app.create_context("user-123", email="user@example.com")
        
        # Verify builder was called correctly
        mock_context_class.builder.assert_called_once_with("user-123")
        mock_builder.kind.assert_called_once_with("user")
        mock_builder.set.assert_called_once_with("email", "user@example.com")
        mock_builder.build.assert_called_once()
        
        # Verify result
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_with_name(self, mock_context_class):
        """Test creating a context with key and name"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context
        result = app.create_context("user-123", name="John Doe")
        
        # Verify builder was called correctly
        mock_context_class.builder.assert_called_once_with("user-123")
        mock_builder.kind.assert_called_once_with("user")
        mock_builder.set.assert_called_once_with("name", "John Doe")
        mock_builder.build.assert_called_once()
        
        # Verify result
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_with_all_attributes(self, mock_context_class):
        """Test creating a context with key, email, and name"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context
        result = app.create_context(
            "user-123",
            email="user@example.com",
            name="John Doe"
        )
        
        # Verify builder was called correctly
        mock_context_class.builder.assert_called_once_with("user-123")
        mock_builder.kind.assert_called_once_with("user")
        
        # Verify both email and name were set
        calls = mock_builder.set.call_args_list
        self.assertEqual(len(calls), 2)
        
        # Check that email and name were set (order may vary)
        set_calls = {call[0][0]: call[0][1] for call in calls}
        self.assertEqual(set_calls["email"], "user@example.com")
        self.assertEqual(set_calls["name"], "John Doe")
        
        mock_builder.build.assert_called_once()
        
        # Verify result
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_strips_whitespace(self, mock_context_class):
        """Test that context creation strips leading/trailing whitespace"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with whitespace
        result = app.create_context(
            "  user-123  ",
            email="  user@example.com  ",
            name="  John Doe  "
        )
        
        # Verify whitespace was stripped
        mock_context_class.builder.assert_called_once_with("user-123")
        
        # Check that email and name were stripped
        calls = mock_builder.set.call_args_list
        set_calls = {call[0][0]: call[0][1] for call in calls}
        self.assertEqual(set_calls["email"], "user@example.com")
        self.assertEqual(set_calls["name"], "John Doe")
    
    @patch('ldclient.Context')
    def test_create_context_ignores_empty_email(self, mock_context_class):
        """Test that empty email strings are not added to context"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with empty email
        result = app.create_context("user-123", email="", name="John Doe")
        
        # Verify only name was set (not empty email)
        mock_builder.set.assert_called_once_with("name", "John Doe")
    
    @patch('ldclient.Context')
    def test_create_context_ignores_empty_name(self, mock_context_class):
        """Test that empty name strings are not added to context"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with empty name
        result = app.create_context("user-123", email="user@example.com", name="")
        
        # Verify only email was set (not empty name)
        mock_builder.set.assert_called_once_with("email", "user@example.com")
    
    @patch('ldclient.Context')
    def test_create_context_ignores_whitespace_only_attributes(self, mock_context_class):
        """Test that whitespace-only attributes are not added to context"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with whitespace-only attributes
        result = app.create_context("user-123", email="   ", name="   ")
        
        # Verify no attributes were set
        mock_builder.set.assert_not_called()


class TestCreateContextValidation(unittest.TestCase):
    """Test cases for context validation"""
    
    def test_create_context_none_key_raises_error(self):
        """Test that None context key raises ValueError"""
        with self.assertRaises(ValueError) as context:
            app.create_context(None)
        
        self.assertIn("cannot be None", str(context.exception))
    
    def test_create_context_empty_key_raises_error(self):
        """Test that empty context key raises ValueError"""
        with self.assertRaises(ValueError) as context:
            app.create_context("")
        
        self.assertIn("cannot be empty", str(context.exception))
    
    def test_create_context_whitespace_key_raises_error(self):
        """Test that whitespace-only context key raises ValueError"""
        with self.assertRaises(ValueError) as context:
            app.create_context("   ")
        
        self.assertIn("cannot be empty", str(context.exception))
    
    def test_create_context_non_string_key_raises_error(self):
        """Test that non-string context key raises ValueError"""
        with self.assertRaises(ValueError) as context:
            app.create_context(123)
        
        self.assertIn("must be a string", str(context.exception))
    
    def test_create_context_non_string_email_raises_error(self):
        """Test that non-string email raises TypeError"""
        with self.assertRaises(TypeError) as context:
            app.create_context("user-123", email=123)
        
        self.assertIn("email must be a string", str(context.exception))
    
    def test_create_context_non_string_name_raises_error(self):
        """Test that non-string name raises TypeError"""
        with self.assertRaises(TypeError) as context:
            app.create_context("user-123", name=123)
        
        self.assertIn("name must be a string", str(context.exception))
    
    @patch('ldclient.Context')
    @patch('app.logger')
    def test_create_context_invalid_email_logs_warning(self, mock_logger, mock_context_class):
        """Test that invalid email format logs a warning"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with invalid email (no @ symbol)
        result = app.create_context("user-123", email="invalid-email")
        
        # Verify warning was logged
        mock_logger.warning.assert_called_once()
        warning_message = mock_logger.warning.call_args[0][0]
        self.assertIn("invalid-email", warning_message)
        self.assertIn("missing @", warning_message)
        
        # Context should still be created
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_builder_exception_raises_runtime_error(self, mock_context_class):
        """Test that exceptions during context building are wrapped in RuntimeError"""
        # Mock Context builder to raise exception
        mock_context_class.builder.side_effect = Exception("SDK error")
        
        # Attempt to create context
        with self.assertRaises(RuntimeError) as context:
            app.create_context("user-123")
        
        self.assertIn("Failed to create context", str(context.exception))
        self.assertIn("SDK error", str(context.exception))

class TestValidateContextKey(unittest.TestCase):
    """Test cases for validate_context_key() helper function"""
    
    def test_validate_valid_key(self):
        """Test validation of valid context key"""
        is_valid, error = app.validate_context_key("user-123")
        
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_validate_none_key(self):
        """Test validation of None context key"""
        is_valid, error = app.validate_context_key(None)
        
        self.assertFalse(is_valid)
        self.assertIn("cannot be None", error)
    
    def test_validate_empty_key(self):
        """Test validation of empty context key"""
        is_valid, error = app.validate_context_key("")
        
        self.assertFalse(is_valid)
        self.assertIn("cannot be empty", error)
    
    def test_validate_whitespace_key(self):
        """Test validation of whitespace-only context key"""
        is_valid, error = app.validate_context_key("   ")
        
        self.assertFalse(is_valid)
        self.assertIn("cannot be empty", error)
    
    def test_validate_non_string_key(self):
        """Test validation of non-string context key"""
        is_valid, error = app.validate_context_key(123)
        
        self.assertFalse(is_valid)
        self.assertIn("must be a string", error)
    
    def test_validate_key_with_special_characters(self):
        """Test validation accepts keys with special characters"""
        is_valid, error = app.validate_context_key("user@example.com")
        
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_validate_key_with_spaces(self):
        """Test validation accepts keys with spaces"""
        is_valid, error = app.validate_context_key("user 123")
        
        self.assertTrue(is_valid)
        self.assertIsNone(error)


class TestContextEdgeCases(unittest.TestCase):
    """Test edge cases for context creation"""
    
    @patch('ldclient.Context')
    def test_create_context_with_unicode_characters(self, mock_context_class):
        """Test creating context with unicode characters"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with unicode
        result = app.create_context(
            "user-123",
            email="user@example.com",
            name="José García"
        )
        
        # Verify unicode name was set correctly
        calls = mock_builder.set.call_args_list
        set_calls = {call[0][0]: call[0][1] for call in calls}
        self.assertEqual(set_calls["name"], "José García")
    
    @patch('ldclient.Context')
    def test_create_context_with_very_long_key(self, mock_context_class):
        """Test creating context with very long key"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Create context with long key
        long_key = "a" * 1000
        result = app.create_context(long_key)
        
        # Verify long key was accepted
        mock_context_class.builder.assert_called_once_with(long_key)
        self.assertEqual(result, mock_context)
    
    @patch('ldclient.Context')
    def test_create_context_with_special_email_formats(self, mock_context_class):
        """Test creating context with various valid email formats"""
        # Mock Context builder
        mock_builder = MagicMock()
        mock_context = MagicMock()
        mock_builder.build.return_value = mock_context
        mock_context_class.builder.return_value = mock_builder
        
        # Test various email formats
        test_emails = [
            "user@example.com",
            "user.name@example.com",
            "user+tag@example.co.uk",
            "user_name@sub.example.com"
        ]
        
        for email in test_emails:
            mock_builder.reset_mock()
            result = app.create_context("user-123", email=email)
            
            # Verify email was set
            mock_builder.set.assert_called_once_with("email", email)


if __name__ == '__main__':
    unittest.main()
