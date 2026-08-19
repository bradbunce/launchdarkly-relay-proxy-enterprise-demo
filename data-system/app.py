"""
LaunchDarkly Data System Configuration demo.

Python SDK uses datasystem.custom() so the SDK:
  1. Streams from Relay Proxy first
  2. Falls back to streaming LaunchDarkly directly
  3. Polls LaunchDarkly as last resort
"""

import os
import re
import time
import logging
import collections
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import ldclient
from ldclient import Context
from ldclient.config import Config
from ldclient import datasystem

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

dashboard_port = os.environ.get("DASHBOARD_PORT", "8000")
node_port = os.environ.get("NODE_SERVICE_PORT", "3000")
CORS(app, resources={
    r"/api/*": {
        "origins": [
            f"http://localhost:{dashboard_port}",
            f"http://localhost:{node_port}",
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
    }
})

SDK_KEY = os.environ.get("LAUNCHDARKLY_SDK_KEY")
RELAY_URI = os.environ.get("RELAY_URI", "http://relay-proxy:8030")
RELAY_HOST = urlparse(RELAY_URI).hostname or "relay-proxy"

_ld_client = None
_sdk_initialized = False
_sdk_initialization_error = None
_init_started_at = None
_init_elapsed_ms = None


class DataSourceTracker(logging.Handler):
    """Follow the stream URL the SDK actually connected to."""

    _connecting = re.compile(r"Connecting to stream at (\S+)")
    _recover = re.compile(r"returning to first synchronizer")
    _removed = re.compile(r"Synchronizer \w+ permanently failed")

    def __init__(self, relay_host):
        super().__init__(level=logging.DEBUG)
        self.relay_host = (relay_host or "").lower()
        self.events = collections.deque(maxlen=40)
        self.active_index = 0
        self.last_host = None
        self.last_mode = None
        self.last_source = None
        self.last_event_at = None
        self.relay_failed = False

    def emit(self, record):
        try:
            message = record.getMessage()
        except Exception:
            return

        lowered = message.lower()
        interesting = any(token in lowered for token in (
            "stream", "poll", "connect", "reconnect", "synchronizer",
            "datasystem", "data source", "launchdarkly", self.relay_host,
            "fallback", "error", "timeout", "401", "404", "recover",
        ))
        if not interesting:
            return

        self.events.append({
            "timestamp": int(time.time() * 1000),
            "level": record.levelname,
            "logger": record.name,
            "message": message[:400],
        })
        self.last_event_at = self.events[-1]["timestamp"]

        connecting = self._connecting.search(message)
        if connecting:
            url = connecting.group(1)
            if self.relay_host and self.relay_host in url.lower():
                self.last_host = self.relay_host
                self.last_source = "relay"
                self.last_mode = "streaming"
                self.active_index = 0
                self.relay_failed = False
            elif "launchdarkly.com" in url.lower():
                self.last_host = "launchdarkly.com"
                self.last_source = "launchdarkly"
                self.last_mode = "polling" if "poll" in url.lower() else "streaming"
                self.active_index = 1
                self.relay_failed = True

        if self._recover.search(message):
            self.active_index = 0
            self.relay_failed = False
            self.last_source = "relay"
            self.last_mode = "streaming"

        if self._removed.search(message) and self.last_source == "relay":
            self.relay_failed = True

        if "poll" in lowered and "launchdarkly.com" in lowered:
            self.last_mode = "polling"
            self.last_source = "launchdarkly"
            self.active_index = 2
            self.relay_failed = True


PATH_IDS = ("sync-relay-stream", "sync-ld-stream", "sync-ld-poll")

data_source_tracker = DataSourceTracker(RELAY_HOST)
logging.getLogger("ldclient").addHandler(data_source_tracker)
logging.getLogger("ldclient").setLevel(logging.INFO)


def _probe_relay_port(timeout=1.5):
    """Return True when Relay is listening. Port-open is not the same as ready-for-SDK-keys."""
    try:
        response = requests.get(f"{RELAY_URI}/status", timeout=timeout)
        return response.status_code < 500
    except requests.RequestException:
        return False


def _relay_environments_ready(timeout=1.5):
    """Relay accepts SDK keys only after AutoConfig environments are VALID."""
    try:
        response = requests.get(f"{RELAY_URI}/status", timeout=timeout)
        if response.status_code >= 500:
            return False
        environments = (response.json() or {}).get("environments") or {}
        if not environments:
            return False
        return all(
            str((env.get("connectionStatus") or {}).get("state") or "").upper() == "VALID"
            for env in environments.values()
        )
    except (requests.RequestException, ValueError, TypeError):
        return False


def _wait_for_relay(timeout=45):
    """Wait until Relay can actually authorize the first streaming hop."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _relay_environments_ready():
            return True
        time.sleep(0.5)
    return False


def _build_data_system_config():
    """
    Custom data system fallback path:

    1. Stream from Relay Proxy
    2. Stream from LaunchDarkly directly
    3. Poll LaunchDarkly as last resort
    """
    return (
        datasystem.custom()
        .synchronizers(
            datasystem.streaming_ds_builder().base_uri(RELAY_URI),
            datasystem.streaming_ds_builder(),
            datasystem.polling_ds_builder(),
        )
        .build()
    )


def initialize_launchdarkly_sdk():
    global _ld_client, _sdk_initialized, _sdk_initialization_error
    global _init_started_at, _init_elapsed_ms

    if _sdk_initialized and _ld_client is not None:
        return True

    if not SDK_KEY:
        _sdk_initialization_error = "LAUNCHDARKLY_SDK_KEY environment variable not set"
        logger.error(_sdk_initialization_error)
        return False

    try:
        logger.info("Initializing LaunchDarkly SDK with custom data system")
        logger.info("Primary data source: Relay Proxy via %s", RELAY_URI)
        logger.info("Fallback data source: LaunchDarkly streaming, then polling")

        if _wait_for_relay():
            logger.info("Relay Proxy environments are VALID at %s", RELAY_URI)
        else:
            logger.warning("Relay Proxy not ready yet; SDK will fall back to LaunchDarkly if streaming fails")

        _init_started_at = time.time()
        config = Config(
            sdk_key=SDK_KEY,
            datasystem_config=_build_data_system_config(),
        )
        ldclient.set_config(config)
        _ld_client = ldclient.get()

        timeout_seconds = 15
        start = time.time()
        while not _ld_client.is_initialized():
            if time.time() - start > timeout_seconds:
                _sdk_initialization_error = (
                    f"SDK initialization timed out after {timeout_seconds}s"
                )
                logger.error(_sdk_initialization_error)
                _sdk_initialized = False
                return False
            time.sleep(0.1)

        _sdk_initialized = True
        _sdk_initialization_error = None
        _init_elapsed_ms = int((time.time() - _init_started_at) * 1000)
        logger.info("LaunchDarkly SDK initialized in %sms", _init_elapsed_ms)
        logger.info("SDK version: %s", ldclient.VERSION)
        return True
    except Exception as exc:
        _sdk_initialization_error = f"Failed to initialize LaunchDarkly SDK: {exc}"
        logger.error(_sdk_initialization_error, exc_info=True)
        _sdk_initialized = False
        return False


def get_ld_client():
    return _ld_client


def is_sdk_initialized():
    return (
        _sdk_initialized
        and _ld_client is not None
        and _ld_client.is_initialized()
    )


def _sdk_data_source_state():
    if _ld_client is None:
        return None
    try:
        status = _ld_client.data_source_status_provider.status
        state = status.state
        return state.name if hasattr(state, "name") else str(state)
    except Exception:
        return None


def _infer_active_source(relay_port_open):
    """
    Follow the configured path using SDK synchronizer index from logs.
    0 = Relay streaming, 1 = LaunchDarkly streaming, 2 = LaunchDarkly polling.
    """
    ds_state = _sdk_data_source_state()
    index = data_source_tracker.active_index

    if not is_sdk_initialized():
        return {
            "id": PATH_IDS[0] if relay_port_open else "none",
            "phase": "initializing",
            "label": _sdk_initialization_error or "SDK initializing — trying Relay streaming",
            "source": "relay" if relay_port_open else "none",
            "mode": "streaming",
            "healthy": False,
            "dataSourceState": ds_state,
            "pathIndex": 0,
        }

    if not relay_port_open or data_source_tracker.relay_failed:
        if index == 0:
            index = 1

    if index <= 0 and relay_port_open and not data_source_tracker.relay_failed:
        return {
            "id": "sync-relay-stream",
            "phase": "synchronizer",
            "label": "Streaming via Relay Proxy",
            "source": "relay",
            "mode": "streaming",
            "healthy": True,
            "dataSourceState": ds_state,
            "pathIndex": 0,
        }

    if index >= 2 or data_source_tracker.last_mode == "polling":
        return {
            "id": "sync-ld-poll",
            "phase": "synchronizer",
            "label": "Polling LaunchDarkly directly",
            "source": "launchdarkly",
            "mode": "polling",
            "healthy": True,
            "dataSourceState": ds_state,
            "pathIndex": 2,
        }

    return {
        "id": "sync-ld-stream",
        "phase": "synchronizer",
        "label": "Streaming from LaunchDarkly directly",
        "source": "launchdarkly",
        "mode": "streaming",
        "healthy": True,
        "dataSourceState": ds_state,
        "pathIndex": 1,
    }


def _configuration_graph(active_id, relay_port_open, sdk_ready):
    def node(node_id, kind, target, uri, description, rank):
        status = "standby"
        if node_id == active_id and sdk_ready:
            status = "active"
        elif node_id == active_id and not sdk_ready:
            status = "initializing"
        elif node_id == "sync-relay-stream" and (not relay_port_open or data_source_tracker.relay_failed):
            status = "failed"
        return {
            "id": node_id,
            "kind": kind,
            "target": target,
            "uri": uri,
            "description": description,
            "rank": rank,
            "status": status,
        }

    return [
        node(
            "sync-relay-stream",
            "streaming",
            "Relay Proxy",
            f"{RELAY_URI}/sdk/stream",
            "Hits first: real-time streaming through Relay",
            "Hits first",
        ),
        node(
            "sync-ld-stream",
            "streaming",
            "LaunchDarkly",
            "https://stream.launchdarkly.com/sdk/stream",
            "Fallback: real-time streaming directly to LaunchDarkly",
            "Fallback",
        ),
        node(
            "sync-ld-poll",
            "polling",
            "LaunchDarkly",
            "https://sdk.launchdarkly.com",
            "Last resort: polling directly from LaunchDarkly",
            "Last resort",
        ),
    ]


def evaluate_user_message():
    default_value = "Hello from Data System!"
    if not is_sdk_initialized():
        return {
            "value": default_value,
            "reason": {"kind": "ERROR", "errorKind": "CLIENT_NOT_READY"},
        }

    context = (
        Context.builder("data-system-demo")
        .kind("user")
        .set("name", "Data System Demo")
        .build()
    )
    container = Context.builder("data-system-app").kind("container").build()
    multi = Context.create_multi(context, container)
    detail = _ld_client.variation_detail("user-message", multi, default_value)
    reason = detail.reason if isinstance(detail.reason, dict) else {"kind": str(detail.reason)}
    return {"value": detail.value, "reason": reason}


def build_status_payload():
    relay_port_open = _probe_relay_port()
    active = _infer_active_source(relay_port_open)
    graph = _configuration_graph(active["id"], relay_port_open, is_sdk_initialized())
    flag = evaluate_user_message()

    return {
        "connected": is_sdk_initialized(),
        "mode": "data-system-custom",
        "sdkVersion": ldclient.VERSION,
        "sdkInitialized": is_sdk_initialized(),
        "initializationError": _sdk_initialization_error,
        "initElapsedMs": _init_elapsed_ms,
        "relayUri": RELAY_URI,
        "relayPortOpen": relay_port_open,
        "activeSource": active,
        "flag": flag,
        "path": graph,
        "events": list(data_source_tracker.events)[-12:],
    }


logger.info("=" * 70)
logger.info("Data System Configuration demo starting")
logger.info("Relay URI: %s", RELAY_URI)
logger.info("=" * 70)

initialize_launchdarkly_sdk()


@app.route("/health", methods=["GET"])
def health_check():
    if is_sdk_initialized():
        return jsonify({
            "status": "healthy",
            "service": "data-system-app",
            "sdkInitialized": True,
        }), 200
    return jsonify({
        "status": "unhealthy",
        "service": "data-system-app",
        "sdkInitialized": False,
        "error": _sdk_initialization_error,
    }), 503


@app.route("/api/status", methods=["GET"])
def get_status():
    return jsonify(build_status_payload()), 200


@app.route("/api/data-system", methods=["GET"])
def get_data_system():
    return jsonify(build_status_payload()), 200


@app.route("/api/flag", methods=["GET"])
def flag_endpoint():
    result = evaluate_user_message()
    result["relayPortOpen"] = _probe_relay_port()
    result["activeSource"] = _infer_active_source(result["relayPortOpen"])
    return jsonify(result), 200


@app.route("/api/relay-port", methods=["GET"])
def relay_port_status():
    open_ = _probe_relay_port()
    return jsonify({
        "open": open_,
        "relayUri": RELAY_URI,
        "message": "Relay port reachable" if open_ else "Relay port unreachable — SDK should fall back to LaunchDarkly",
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5001")))
