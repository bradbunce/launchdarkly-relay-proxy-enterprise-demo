"""
Property-Based Tests for Status Endpoint Response Completeness

This module contains property-based tests that validate the status endpoint
always returns complete responses with required fields across all possible inputs.

**Validates: Requirements 1.6**
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys
from hypothesis import given, strategies as st, settings

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app


class TestStatusEndpointResponseCompleteness(unittest.TestCase):
    """
    Property-Based Tests for Status Endpoint Response Completeness
    
    Feature: python-sdk-support
    Property 1: Status Endpoint Response Completeness
    
    **Validates: Requirements 1.6**
    
    For any valid HTTP GET request to the Python service status endpoint (`/api/status`),
    the response SHALL contain both `connectionState` and `sdkVersion` fields with non-null values.
    """
    
    def setUp(self):
        """Set up test client"""
        self.app = app.app
        self.client = self.app.test_client()
        self.app_module = app
    
    @given(
        sdk_initialized=st.booleans(),
        connection_state=st.sampled_from(['VALID', 'INITIALIZING', 'INTERRUPTED', 'OFF']),
        sdk_version=st.text(min_size=1, max_size=20, alphabet=st.characters(
            whitelist_categories=('Nd', 'Lu', 'Ll'),
            whitelist_characters='.-_'
        ))
    )
    @settings(max_examples=100, deadline=None)
    def test_status_endpoint_always_contains_required_fields(
        self, sdk_initialized, connection_state, sdk_version
    ):
        """
        Property Test: Status endpoint response completeness
        
        **Validates: Requirements 1.6**
        
        This property test verifies that for ANY combination of SDK states,
        the /api/status endpoint ALWAYS returns a response containing:
        - connectionState field (non-null)
        - sdkVersion field (non-null)
        
        The test generates 100 random combinations of:
        - SDK initialization state (True/False)
        - Connection state (VALID, INITIALIZING, INTERRUPTED, OFF)
        - SDK version strings (various formats)
        
        This ensures the endpoint is robust across all possible states.
        """
        # Mock the SDK state
        with patch('app.is_sdk_initialized') as mock_initialized, \
             patch('app.get_sdk_connection_state') as mock_state, \
             patch('app.ldclient.VERSION', sdk_version):
            
            mock_initialized.return_value = sdk_initialized
            mock_state.return_value = connection_state
            
            # Make request to status endpoint
            response = self.client.get('/api/status')
            
            # Verify response is successful
            self.assertEqual(response.status_code, 200, 
                           f"Status endpoint should return 200, got {response.status_code}")
            
            # Parse JSON response
            data = response.get_json()
            self.assertIsNotNone(data, "Response should contain JSON data")
            
            # PROPERTY: Response MUST contain connectionState field
            self.assertIn('connectionState', data,
                         "Response must contain 'connectionState' field")
            
            # PROPERTY: connectionState MUST be non-null
            self.assertIsNotNone(data['connectionState'],
                               "connectionState field must not be None")
            
            # PROPERTY: Response MUST contain sdkVersion field
            self.assertIn('sdkVersion', data,
                         "Response must contain 'sdkVersion' field")
            
            # PROPERTY: sdkVersion MUST be non-null
            self.assertIsNotNone(data['sdkVersion'],
                               "sdkVersion field must not be None")
            
            # Additional validation: verify connectionState matches expected value
            self.assertEqual(data['connectionState'], connection_state,
                           f"connectionState should be {connection_state}")
            
            # Additional validation: verify sdkVersion is correct
            if sdk_initialized:
                self.assertEqual(data['sdkVersion'], sdk_version,
                               f"sdkVersion should be {sdk_version} when initialized")
            else:
                self.assertEqual(data['sdkVersion'], 'not-initialized',
                               "sdkVersion should be 'not-initialized' when not initialized")
    
    @given(
        sdk_initialized=st.booleans(),
        connection_state=st.sampled_from(['VALID', 'INITIALIZING', 'INTERRUPTED', 'OFF'])
    )
    @settings(max_examples=100, deadline=None)
    def test_status_endpoint_response_structure_is_consistent(
        self, sdk_initialized, connection_state
    ):
        """
        Property Test: Status endpoint response structure consistency
        
        **Validates: Requirements 1.6**
        
        This property test verifies that the status endpoint response structure
        is consistent across all SDK states. The response should always contain
        the same set of required fields regardless of initialization state.
        """
        # Mock the SDK state
        with patch('app.is_sdk_initialized') as mock_initialized, \
             patch('app.get_sdk_connection_state') as mock_state, \
             patch('app.ldclient.VERSION', '9.0.0'):
            
            mock_initialized.return_value = sdk_initialized
            mock_state.return_value = connection_state
            
            # Make request to status endpoint
            response = self.client.get('/api/status')
            data = response.get_json()
            
            # PROPERTY: Response MUST contain all required fields
            required_fields = ['connected', 'mode', 'sdkVersion', 'sdkInitialized', 'connectionState']
            for field in required_fields:
                self.assertIn(field, data,
                            f"Response must contain required field '{field}'")
                self.assertIsNotNone(data[field],
                                   f"Required field '{field}' must not be None")
            
            # PROPERTY: mode field MUST always be "default"
            self.assertEqual(data['mode'], 'default',
                           "mode field must always be 'default' for Python service")
            
            # PROPERTY: sdkInitialized MUST match the mocked state
            self.assertEqual(data['sdkInitialized'], sdk_initialized,
                           f"sdkInitialized should be {sdk_initialized}")
            
            # PROPERTY: connected MUST be True only when initialized and state is VALID
            expected_connected = sdk_initialized and connection_state == 'VALID'
            self.assertEqual(data['connected'], expected_connected,
                           f"connected should be {expected_connected}")
    
    @given(
        request_method=st.sampled_from(['GET']),
        query_params=st.dictionaries(
            keys=st.text(min_size=1, max_size=10, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))),
            values=st.text(min_size=0, max_size=20),
            max_size=5
        )
    )
    @settings(max_examples=100, deadline=None)
    def test_status_endpoint_ignores_query_parameters(self, request_method, query_params):
        """
        Property Test: Status endpoint ignores query parameters
        
        **Validates: Requirements 1.6**
        
        This property test verifies that the status endpoint returns complete
        responses regardless of any query parameters that might be included
        in the request. The endpoint should be robust to unexpected inputs.
        """
        # Mock SDK state to initialized
        with patch('app.is_sdk_initialized') as mock_initialized, \
             patch('app.get_sdk_connection_state') as mock_state, \
             patch('app.ldclient.VERSION', '9.0.0'):
            
            mock_initialized.return_value = True
            mock_state.return_value = 'VALID'
            
            # Build query string from parameters
            query_string = '&'.join([f"{k}={v}" for k, v in query_params.items()])
            path = f'/api/status?{query_string}' if query_string else '/api/status'
            
            # Make request with query parameters
            response = self.client.get(path)
            
            # Verify response is successful
            self.assertEqual(response.status_code, 200,
                           "Status endpoint should return 200 regardless of query params")
            
            # Parse JSON response
            data = response.get_json()
            
            # PROPERTY: Response MUST still contain required fields
            self.assertIn('connectionState', data,
                         "Response must contain 'connectionState' even with query params")
            self.assertIsNotNone(data['connectionState'],
                               "connectionState must not be None even with query params")
            
            self.assertIn('sdkVersion', data,
                         "Response must contain 'sdkVersion' even with query params")
            self.assertIsNotNone(data['sdkVersion'],
                               "sdkVersion must not be None even with query params")
    
    @given(
        sdk_version=st.one_of(
            st.just('9.0.0'),
            st.just('9.14.1'),
            st.just('10.0.0-beta'),
            st.just('8.5.2'),
            st.text(min_size=1, max_size=15, alphabet='0123456789.')
        )
    )
    @settings(max_examples=100, deadline=None)
    def test_status_endpoint_handles_various_sdk_versions(self, sdk_version):
        """
        Property Test: Status endpoint handles various SDK version formats
        
        **Validates: Requirements 1.6**
        
        This property test verifies that the status endpoint correctly returns
        the sdkVersion field for various version string formats, ensuring
        the field is always present and non-null.
        """
        # Mock SDK state with various version strings
        with patch('app.is_sdk_initialized') as mock_initialized, \
             patch('app.get_sdk_connection_state') as mock_state, \
             patch('app.ldclient.VERSION', sdk_version):
            
            mock_initialized.return_value = True
            mock_state.return_value = 'VALID'
            
            # Make request to status endpoint
            response = self.client.get('/api/status')
            data = response.get_json()
            
            # PROPERTY: sdkVersion MUST be present and non-null
            self.assertIn('sdkVersion', data,
                         "Response must contain 'sdkVersion' field")
            self.assertIsNotNone(data['sdkVersion'],
                               "sdkVersion field must not be None")
            
            # PROPERTY: sdkVersion MUST match the SDK's reported version
            self.assertEqual(data['sdkVersion'], sdk_version,
                           f"sdkVersion should match SDK version: {sdk_version}")
    
    @given(
        error_message=st.one_of(
            st.just('SDK key missing'),
            st.just('Connection timeout'),
            st.just('Network error'),
            st.text(min_size=1, max_size=100)
        )
    )
    @settings(max_examples=100, deadline=None)
    def test_status_endpoint_with_initialization_errors(self, error_message):
        """
        Property Test: Status endpoint handles initialization errors gracefully
        
        **Validates: Requirements 1.6**
        
        This property test verifies that even when SDK initialization fails,
        the status endpoint still returns a complete response with all required
        fields (connectionState and sdkVersion) present and non-null.
        """
        # Mock SDK not initialized with error
        with patch('app.is_sdk_initialized') as mock_initialized, \
             patch('app.get_sdk_connection_state') as mock_state, \
             patch('app._sdk_initialization_error', error_message):
            
            mock_initialized.return_value = False
            mock_state.return_value = 'OFF'
            
            # Make request to status endpoint
            response = self.client.get('/api/status')
            
            # Verify response is still successful (200)
            self.assertEqual(response.status_code, 200,
                           "Status endpoint should return 200 even with initialization errors")
            
            # Parse JSON response
            data = response.get_json()
            
            # PROPERTY: Response MUST contain connectionState field
            self.assertIn('connectionState', data,
                         "Response must contain 'connectionState' even with errors")
            self.assertIsNotNone(data['connectionState'],
                               "connectionState must not be None even with errors")
            self.assertEqual(data['connectionState'], 'OFF',
                           "connectionState should be 'OFF' when initialization fails")
            
            # PROPERTY: Response MUST contain sdkVersion field
            self.assertIn('sdkVersion', data,
                         "Response must contain 'sdkVersion' even with errors")
            self.assertIsNotNone(data['sdkVersion'],
                               "sdkVersion must not be None even with errors")
            self.assertEqual(data['sdkVersion'], 'not-initialized',
                           "sdkVersion should be 'not-initialized' when initialization fails")
            
            # PROPERTY: Response SHOULD contain error field with the error message
            self.assertIn('error', data,
                         "Response should contain 'error' field when initialization fails")
            self.assertEqual(data['error'], error_message,
                           f"Error message should match: {error_message}")


if __name__ == '__main__':
    unittest.main()
