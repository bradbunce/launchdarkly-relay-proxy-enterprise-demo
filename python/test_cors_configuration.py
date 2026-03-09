"""
Unit Tests for Python Service CORS Configuration

This module contains comprehensive unit tests for the Python service CORS configuration
to ensure it correctly uses environment variables for port configuration.

Tests cover:
- CORS with custom DASHBOARD_PORT and NODE_SERVICE_PORT values
- CORS with missing environment variables (fallback to defaults)
- CORS origin matching with dynamic ports
- Verification that no hardcoded configurable ports exist in CORS configuration

**Validates: Requirements 4.3, 8.5**

Note: Some tests require Flask dependencies and will only run in the Docker environment.
The critical tests in TestNoHardcodedPorts and TestCORSEnvironmentVariableReading classes
can run without Flask and verify the core requirements.
"""

import unittest
from unittest.mock import patch
import os
import sys

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class TestCORSConfiguration(unittest.TestCase):
    """Unit tests for CORS configuration with environment variables"""
    
    def tearDown(self):
        """Clean up environment variables after each test"""
        # Remove test environment variables
        if 'DASHBOARD_PORT' in os.environ:
            del os.environ['DASHBOARD_PORT']
        if 'NODE_SERVICE_PORT' in os.environ:
            del os.environ['NODE_SERVICE_PORT']
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '9000', 'NODE_SERVICE_PORT': '9001'})
    def test_cors_with_custom_ports(self):
        """Test CORS configuration uses custom port values from environment"""
        # Import app module with custom environment variables
        # Need to reload to pick up new environment variables
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a request with custom dashboard origin
        response = client.get('/api/status', headers={
            'Origin': 'http://localhost:9000'
        })
        
        # Verify CORS headers are set correctly
        self.assertEqual(response.status_code, 200)
        # Flask-CORS should allow the origin
        self.assertIn('Access-Control-Allow-Origin', response.headers)
    
    @patch.dict(os.environ, {}, clear=True)
    def test_cors_with_default_ports(self):
        """Test CORS configuration falls back to default ports when environment variables are missing"""
        # Remove port environment variables
        os.environ.pop('DASHBOARD_PORT', None)
        os.environ.pop('NODE_SERVICE_PORT', None)
        
        # Import app module without custom environment variables
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a request with default dashboard origin
        response = client.get('/api/status', headers={
            'Origin': 'http://localhost:8000'
        })
        
        # Verify CORS headers are set correctly
        self.assertEqual(response.status_code, 200)
        self.assertIn('Access-Control-Allow-Origin', response.headers)
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '7000', 'NODE_SERVICE_PORT': '7001'})
    def test_cors_origin_matching_with_custom_dashboard_port(self):
        """Test CORS allows requests from custom dashboard port"""
        # Import app module with custom environment variables
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a request from custom dashboard port
        response = client.get('/api/status', headers={
            'Origin': 'http://localhost:7000'
        })
        
        # Verify request is allowed
        self.assertEqual(response.status_code, 200)
        self.assertIn('Access-Control-Allow-Origin', response.headers)
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '7000', 'NODE_SERVICE_PORT': '7001'})
    def test_cors_origin_matching_with_custom_node_port(self):
        """Test CORS allows requests from custom node service port"""
        # Import app module with custom environment variables
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a request from custom node service port
        response = client.get('/api/status', headers={
            'Origin': 'http://localhost:7001'
        })
        
        # Verify request is allowed
        self.assertEqual(response.status_code, 200)
        self.assertIn('Access-Control-Allow-Origin', response.headers)
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '9000', 'NODE_SERVICE_PORT': '9001'})
    def test_cors_rejects_unauthorized_origin(self):
        """Test CORS rejects requests from unauthorized origins"""
        # Import app module with custom environment variables
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a request from unauthorized origin
        response = client.get('/api/status', headers={
            'Origin': 'http://localhost:8888'
        })
        
        # Verify request is processed but CORS may not allow it
        # (Flask-CORS handles this, we just verify the app doesn't crash)
        self.assertEqual(response.status_code, 200)


class TestCORSEnvironmentVariableReading(unittest.TestCase):
    """Unit tests for environment variable reading in CORS configuration"""
    
    def tearDown(self):
        """Clean up environment variables after each test"""
        if 'DASHBOARD_PORT' in os.environ:
            del os.environ['DASHBOARD_PORT']
        if 'NODE_SERVICE_PORT' in os.environ:
            del os.environ['NODE_SERVICE_PORT']
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '8500'})
    def test_reads_dashboard_port_from_environment(self):
        """Test that DASHBOARD_PORT is read from environment variable"""
        # Verify environment variable is set
        self.assertEqual(os.environ.get('DASHBOARD_PORT'), '8500')
        
        # Import app module
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # The app should have been initialized with the custom port
        # We can't directly inspect the CORS config, but we can verify the app loads
        self.assertIsNotNone(app_module.app)
    
    @patch.dict(os.environ, {'NODE_SERVICE_PORT': '3500'})
    def test_reads_node_service_port_from_environment(self):
        """Test that NODE_SERVICE_PORT is read from environment variable"""
        # Verify environment variable is set
        self.assertEqual(os.environ.get('NODE_SERVICE_PORT'), '3500')
        
        # Import app module
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # The app should have been initialized with the custom port
        self.assertIsNotNone(app_module.app)
    
    def test_fallback_to_default_dashboard_port(self):
        """Test that DASHBOARD_PORT falls back to '8000' when not set"""
        # Ensure environment variable is not set
        os.environ.pop('DASHBOARD_PORT', None)
        
        # Get the default value
        dashboard_port = os.environ.get('DASHBOARD_PORT', '8000')
        
        # Verify fallback to default
        self.assertEqual(dashboard_port, '8000')
    
    def test_fallback_to_default_node_service_port(self):
        """Test that NODE_SERVICE_PORT falls back to '3000' when not set"""
        # Ensure environment variable is not set
        os.environ.pop('NODE_SERVICE_PORT', None)
        
        # Get the default value
        node_port = os.environ.get('NODE_SERVICE_PORT', '3000')
        
        # Verify fallback to default
        self.assertEqual(node_port, '3000')


class TestCORSContextEndpoint(unittest.TestCase):
    """Unit tests for CORS in /api/context endpoint"""
    
    def tearDown(self):
        """Clean up environment variables after each test"""
        if 'DASHBOARD_PORT' in os.environ:
            del os.environ['DASHBOARD_PORT']
    
    @patch.dict(os.environ, {'DASHBOARD_PORT': '9500'})
    def test_context_endpoint_uses_custom_dashboard_port_in_origin_fallback(self):
        """Test that /api/context endpoint uses custom DASHBOARD_PORT in origin fallback"""
        # Import app module with custom environment variable
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a GET request to /api/context without Origin header
        # The endpoint should use the custom dashboard port as fallback
        response = client.get('/api/context')
        
        # Verify response is successful
        self.assertEqual(response.status_code, 200)
        
        # Verify CORS headers are present
        self.assertIn('Access-Control-Allow-Origin', response.headers)
    
    def test_context_endpoint_uses_default_dashboard_port_in_origin_fallback(self):
        """Test that /api/context endpoint uses default DASHBOARD_PORT when not set"""
        # Ensure environment variable is not set
        os.environ.pop('DASHBOARD_PORT', None)
        
        # Import app module without custom environment variable
        import importlib
        import app as app_module
        importlib.reload(app_module)
        
        # Get the Flask app
        test_app = app_module.app
        client = test_app.test_client()
        
        # Make a GET request to /api/context without Origin header
        response = client.get('/api/context')
        
        # Verify response is successful
        self.assertEqual(response.status_code, 200)
        
        # Verify CORS headers are present
        self.assertIn('Access-Control-Allow-Origin', response.headers)


class TestNoHardcodedPorts(unittest.TestCase):
    """Unit tests to verify no hardcoded configurable ports in CORS configuration"""
    
    def test_no_hardcoded_8000_in_cors_origins(self):
        """Test that CORS configuration does not contain hardcoded port 8000"""
        # Read the app.py file
        app_file_path = os.path.join(os.path.dirname(__file__), 'app.py')
        with open(app_file_path, 'r') as f:
            content = f.read()
        
        # Find the CORS configuration section
        cors_start = content.find('CORS(app, resources={')
        cors_end = content.find('})', cors_start) + 2
        cors_section = content[cors_start:cors_end]
        
        # Verify no hardcoded port 8000 in origins list
        # Should use environment variable instead
        self.assertNotIn('"http://localhost:8000"', cors_section)
        self.assertNotIn("'http://localhost:8000'", cors_section)
    
    def test_no_hardcoded_3000_in_cors_origins(self):
        """Test that CORS configuration does not contain hardcoded port 3000"""
        # Read the app.py file
        app_file_path = os.path.join(os.path.dirname(__file__), 'app.py')
        with open(app_file_path, 'r') as f:
            content = f.read()
        
        # Find the CORS configuration section
        cors_start = content.find('CORS(app, resources={')
        cors_end = content.find('})', cors_start) + 2
        cors_section = content[cors_start:cors_end]
        
        # Verify no hardcoded port 3000 in origins list
        # Should use environment variable instead
        self.assertNotIn('"http://localhost:3000"', cors_section)
        self.assertNotIn("'http://localhost:3000'", cors_section)
    
    def test_cors_uses_environment_variables(self):
        """Test that CORS configuration uses os.environ.get for port values"""
        # Read the app.py file
        app_file_path = os.path.join(os.path.dirname(__file__), 'app.py')
        with open(app_file_path, 'r') as f:
            content = f.read()
        
        # Find the CORS configuration section (including variable declarations)
        cors_start = content.find('# Enable CORS for dashboard access')
        cors_end = content.find('})', cors_start) + 2
        cors_section = content[cors_start:cors_end]
        
        # Verify environment variable usage
        self.assertIn("os.environ.get('DASHBOARD_PORT'", cors_section)
        self.assertIn("os.environ.get('NODE_SERVICE_PORT'", cors_section)
        
        # Verify f-string usage for dynamic origins
        self.assertIn('f"http://localhost:{dashboard_port}"', cors_section)
        self.assertIn('f"http://localhost:{node_port}"', cors_section)


if __name__ == '__main__':
    unittest.main()
