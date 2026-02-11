#!/usr/bin/env python3
"""
Test script to explore Python SDK internal structure and access flag data store.
"""

import os
import sys
import json
import ldclient
from ldclient.config import Config
from ldclient import Context

# Set SDK key from environment
sdk_key = os.environ.get('LAUNCHDARKLY_SDK_KEY')

if not sdk_key:
    print("ERROR: LAUNCHDARKLY_SDK_KEY not set")
    sys.exit(1)

print("Initializing LaunchDarkly Python SDK...")
config = Config(sdk_key=sdk_key)
ldclient.set_config(config)
client = ldclient.get()

# Wait for initialization
print("Waiting for SDK to initialize...")
import time
start = time.time()
while not client.is_initialized() and time.time() - start < 10:
    time.sleep(0.1)

if not client.is_initialized():
    print("ERROR: SDK failed to initialize")
    sys.exit(1)

print("SDK initialized successfully!")
print()

# Explore client structure
print("=== Exploring Client Structure ===")
print(f"Client type: {type(client)}")
print(f"Client attributes: {dir(client)}")
print()

# Check for _store or _data_store attribute
if hasattr(client, '_store'):
    print("Found _store attribute!")
    store = client._store
    print(f"Store type: {type(store)}")
    print(f"Store attributes: {dir(store)}")
    print()
    
    # Try to get all flags
    if hasattr(store, 'all'):
        print("Store has 'all' method, trying to get all flags...")
        try:
            # The store.all() method needs a 'kind' parameter
            # In LaunchDarkly, flags are stored under 'features' kind
            from ldclient.versioned_data_kind import FEATURES
            flags = store.all(FEATURES)
            print(f"Retrieved {len(flags)} flags from store")
            print()
            
            # Print first flag details
            if flags:
                first_key = list(flags.keys())[0]
                first_flag = flags[first_key]
                print(f"Sample flag '{first_key}':")
                print(json.dumps(first_flag, indent=2, default=str))
        except Exception as e:
            print(f"Error calling store.all(): {e}")
    
    if hasattr(store, 'get'):
        print("\nStore has 'get' method, trying to get a specific flag...")
        try:
            from ldclient.versioned_data_kind import FEATURES
            flag = store.get(FEATURES, 'user-message')
            if flag:
                print("Retrieved 'user-message' flag:")
                print(json.dumps(flag, indent=2, default=str))
            else:
                print("Flag 'user-message' not found")
        except Exception as e:
            print(f"Error calling store.get(): {e}")

elif hasattr(client, '_data_store'):
    print("Found _data_store attribute!")
    store = client._data_store
    print(f"Store type: {type(store)}")
    print(f"Store attributes: {dir(store)}")
else:
    print("No _store or _data_store attribute found")
    print("Trying other attributes...")
    
    # Check for _config
    if hasattr(client, '_config'):
        print("\nFound _config attribute")
        config_obj = client._config
        print(f"Config type: {type(config_obj)}")
        print(f"Config attributes: {dir(config_obj)}")
        
        if hasattr(config_obj, 'feature_store'):
            print("\nFound feature_store in config!")
            store = config_obj.feature_store
            print(f"Store type: {type(store)}")
            print(f"Store attributes: {dir(store)}")
            
            # Try to get all flags
            if hasattr(store, 'all'):
                print("\nStore has 'all' method, trying to get all flags...")
                try:
                    from ldclient.versioned_data_kind import FEATURES
                    
                    # The all() method uses a callback pattern
                    result_container = {'flags': None}
                    
                    def callback(result):
                        result_container['flags'] = result
                    
                    store.all(FEATURES, callback)
                    flags = result_container['flags']
                    
                    if flags:
                        print(f"Retrieved {len(flags)} flags from store")
                        print()
                        
                        # Print all flag keys
                        print("Flag keys:", list(flags.keys()))
                        print()
                        
                        # Print first flag details
                        first_key = list(flags.keys())[0]
                        first_flag_obj = flags[first_key]
                        print(f"Sample flag '{first_key}':")
                        print(f"Type: {type(first_flag_obj)}")
                        print(f"Attributes: {[attr for attr in dir(first_flag_obj) if not attr.startswith('_')]}")
                        print()
                        
                        # Try to convert to dict
                        if hasattr(first_flag_obj, 'to_json_dict'):
                            print("Has to_json_dict() method")
                            first_flag = first_flag_obj.to_json_dict()
                        elif hasattr(first_flag_obj, '__dict__'):
                            print("Using __dict__")
                            first_flag = first_flag_obj.__dict__
                        else:
                            # Parse the string representation
                            print("Parsing string representation")
                            first_flag = json.loads(str(first_flag_obj))
                        
                        print(json.dumps(first_flag, indent=2, default=str))
                        print()
                        
                        # Check what attributes the flag has
                        if isinstance(first_flag, dict):
                            print("Flag attributes:", list(first_flag.keys()))
                    else:
                        print("No flags retrieved")
                except Exception as e:
                    print(f"Error calling store.all(): {e}")
                    import traceback
                    traceback.print_exc()

print("\n=== Test Complete ===")
