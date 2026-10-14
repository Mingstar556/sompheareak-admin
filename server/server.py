import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import time
import uuid
import hmac
import hashlib
import base64
import json
import ipaddress
from urllib.parse import urlparse
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from functools import wraps
import gzip
from flask import Flask, request, jsonify, send_from_directory, redirect, g, make_response
import database

# ================================================================
# Somphea Reak Studio - Unified Python API Server
# Powers both the Customer Storefront and the Standalone Admin Desk (sompheareakAdmin).
# ================================================================

# Auto-detect exported web build dist directories (split frontends or fallback dist)
CUSTOMER_DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), 'customer-front', 'dist')
if not os.path.isdir(CUSTOMER_DIST_DIR):
    CUSTOMER_DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), 'dist')
if not os.path.isdir(CUSTOMER_DIST_DIR):
    CUSTOMER_DIST_DIR = os.path.join(BASE_DIR, 'dist')

ADMIN_DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), 'admin-panel', 'dist')
DIST_DIR = CUSTOMER_DIST_DIR

# --- Environment Variable & Secrets Loading ---
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, '.env'))
except ImportError:
    _env_file = os.path.join(BASE_DIR, '.env')
    if os.path.exists(_env_file):
        with open(_env_file, 'r', encoding='utf-8') as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith('#') and '=' in _line:
                    _k, _v = _line.split('=', 1)
                    os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# Initialize Database Schema & Admin Auth Hash
database.init_db()

app = Flask(__name__, static_folder=BASE_DIR)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'sompheareak_secret_key_prod_2026')
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))

# --- Token Configuration (Cryptographic Signed JWT) ---
TOKEN_LIFETIME_SECONDS = int(os.environ.get('TOKEN_LIFETIME_SECONDS', 86400)) # 24 Hours default

def create_signed_token(payload: dict) -> str:
    """Create an HMAC-SHA256 cryptographically signed JWT token."""
    header = {"alg": "HS256", "typ": "JWT"}
    secret = app.config['SECRET_KEY'].encode('utf-8')
    h_b64 = base64.urlsafe_b64encode(json.dumps(header, separators=(',', ':')).encode('utf-8')).decode('utf-8').rstrip('=')
    p_b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode('utf-8')).decode('utf-8').rstrip('=')
    msg = f"{h_b64}.{p_b64}".encode('utf-8')
    sig = hmac.new(secret, msg, hashlib.sha256).digest()
    s_b64 = base64.urlsafe_b64encode(sig).decode('utf-8').rstrip('=')
    return f"{h_b64}.{p_b64}.{s_b64}"

def verify_signed_token(token: str) -> dict | None:
    """Verify cryptographic signature, structure, and expiration of JWT token."""
    if not token or not isinstance(token, str):
        return None
    try:
        parts = token.strip().split('.')
        if len(parts) != 3:
            return None
        h_b64, p_b64, s_b64 = parts
        secret = app.config['SECRET_KEY'].encode('utf-8')
        msg = f"{h_b64}.{p_b64}".encode('utf-8')
        expected_sig = hmac.new(secret, msg, hashlib.sha256).digest()

        sig_pad = '=' * (-len(s_b64) % 4)
        actual_sig = base64.urlsafe_b64decode(s_b64 + sig_pad)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        p_pad = '=' * (-len(p_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(p_b64 + p_pad).decode('utf-8'))

        # Check expiration timestamp
        exp = payload.get('exp')
        if exp and int(exp) < time.time():
            return None

        return payload
    except Exception:
        return None

def extract_token_from_request(req) -> str | None:
    """Extract Bearer token or custom admin token header."""
    auth_hdr = req.headers.get('Authorization', '').strip()
    if auth_hdr.startswith('Bearer '):
        return auth_hdr[7:].strip()
    custom_hdr = req.headers.get('X-Admin-Token', '').strip()
    if custom_hdr:
        return custom_hdr
    return None

# --- Strict Allowed Origins Whitelist ---
def load_allowed_origins() -> set:
    configured = os.environ.get('ALLOWED_ORIGINS', '')
    origins = set()
    if configured:
        for item in configured.split(','):
            norm = item.strip().rstrip('/').lower()
            if norm:
                origins.add(norm)
    # Production Domains
    prod_domain = os.environ.get('PRODUCTION_DOMAIN', 'https://sompheareak.com').strip().rstrip('/').lower()
    if prod_domain:
        origins.add(prod_domain)
    origins.add('https://sompheareak.com')
    origins.add('https://www.sompheareak.com')
    origins.add('https://admin.sompheareak.com')
    origins.add('https://mingstar556.github.io')

    # Authorized Development Origins
    origins.add('http://127.0.0.1:5000')
    origins.add('http://localhost:5000')
    origins.add('http://127.0.0.1:5500')
    origins.add('http://localhost:5500')
    return origins

ALLOWED_ORIGINS = load_allowed_origins()

def is_private_or_local_origin(origin_str: str) -> bool:
    """Check if origin is localhost, loopback, or private LAN address (RFC 1918) for Wi-Fi mobile testing."""
    try:
        parsed = urlparse(origin_str)
        hostname = (parsed.hostname or '').lower()
        if not hostname:
            return False
        if hostname in ('localhost', '127.0.0.1', '::1'):
            return True
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback
    except Exception:
        return False

def is_origin_allowed(origin_hdr: str | None) -> bool:
    """Validate whether an Origin header matches authorized domains or private LAN during development."""
    if not origin_hdr or origin_hdr == 'null':
        return True # Non-browser, same-origin, or local mobile app request
    norm = origin_hdr.strip().rstrip('/').lower()
    if norm in ALLOWED_ORIGINS or norm.startswith('exp://') or norm.startswith('http://localhost') or norm.startswith('http://127.0.0.1') or norm.startswith('http://10.0.2.2'):
        return True
    return is_private_or_local_origin(norm)

# --- Admin Authentication & Rate Limiting Storage ---
FAILED_PIN_ATTEMPTS = {}
MAX_PIN_ATTEMPTS = int(os.environ.get('ADMIN_RATE_LIMIT_MAX_ATTEMPTS', 3))
PIN_LOCK_WINDOW = int(os.environ.get('ADMIN_RATE_LIMIT_WINDOW_SECONDS', 60))

def check_pin_rate_limit(ip):
    # Only exempt explicit development environment from lockout
    if os.environ.get('FLASK_ENV', 'production') == 'development':
        return True, 0
    now_ts = time.time()
    record = FAILED_PIN_ATTEMPTS.get(ip)
    if not record:
        return True, 0
    if record.get('locked_until', 0) > now_ts:
        return False, int(record['locked_until'] - now_ts)
    if now_ts - record.get('last_attempt', 0) > PIN_LOCK_WINDOW:
        FAILED_PIN_ATTEMPTS.pop(ip, None)
        return True, 0
    return True, 0

def record_failed_pin(ip):
    now_ts = time.time()
    record = FAILED_PIN_ATTEMPTS.setdefault(ip, {'count': 0, 'last_attempt': now_ts, 'locked_until': 0})
    record['count'] += 1
    record['last_attempt'] = now_ts
    if record['count'] >= MAX_PIN_ATTEMPTS:
        record['locked_until'] = now_ts + PIN_LOCK_WINDOW

def record_success_pin(ip):
    FAILED_PIN_ATTEMPTS.pop(ip, None)

# --- General Sliding-Window IP Rate Limiter ---
ACTION_RATE_LIMITS = {}

def check_action_rate_limit(key: str, max_requests: int = 15, window_seconds: int = 60) -> tuple[bool, int]:
    # Only exempt loopback during explicit local development mode
    if (key.startswith('127.0.0.1') or key.startswith('localhost')) and os.environ.get('FLASK_ENV', 'production') == 'development':
        return True, 0
    now_ts = time.time()
    record = ACTION_RATE_LIMITS.setdefault(key, [])
    # Evict timestamps older than window
    ACTION_RATE_LIMITS[key] = [t for t in record if now_ts - t < window_seconds]
    if len(ACTION_RATE_LIMITS[key]) >= max_requests:
        oldest = ACTION_RATE_LIMITS[key][0]
        retry_after = max(1, int(window_seconds - (now_ts - oldest)))
        return False, retry_after
    ACTION_RATE_LIMITS[key].append(now_ts)
    return True, 0

def is_admin_authorized(req) -> bool:
    """Validate permission server-side based strictly on cryptographically signed token."""
    token = extract_token_from_request(req)
    if not token:
        return False
    claims = verify_signed_token(token)
    return bool(claims and claims.get('role') == 'admin')

def admin_required(f):
    """View decorator ensuring administrative rights (validated via signed JWT token)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not getattr(g, 'is_admin', False):
            return jsonify({
                'ok': False,
                'error': 'Unauthorized: Valid signed admin token required',
                'code': 'ADMIN_TOKEN_REQUIRED',
                'client_type': getattr(g, 'client_type', 'unknown')
            }), 401
        return f(*args, **kwargs)
    return decorated


# ================================================================
# MIDDLEWARE PATTERN PIPELINE
# 1. Enforces strict origin restriction
# 2. Validates signed tokens server-side (NEVER trusts X-Client-Role)
# 3. Enforces role-based guards on administrative routes
# ================================================================

ADMIN_MUTATION_PATHS = {
    ('/api/settings', 'POST'),
    ('/api/categories', 'POST'),
    ('/api/category-filters', 'POST'),
    ('/api/category-filter', 'POST'),
    ('/api/category-filters/', 'POST'),
    ('/api/category-filter/', 'POST'),
    ('/api/products', 'POST'),
    ('/api/products/seed', 'POST'),
    ('/api/products/clear', 'POST'),
    ('/api/charms', 'POST'),
    ('/api/charms/seed', 'POST'),
    ('/api/charms/clear', 'POST'),
}

def is_administrative_route(path: str, method: str) -> bool:
    """Determine if a route is inherently an administrative action."""
    if path.startswith('/api/admin/'):
        return True
    if (path, method) in ADMIN_MUTATION_PATHS:
        return True
    # Customer data dump protection
    if path == '/api/users' and method == 'GET':
        return True
    # DELETE operations on resources
    if method == 'DELETE' and (path.startswith('/api/categories/') or path.startswith('/api/category-filters/') or path.startswith('/api/category-filter/') or path.startswith('/api/products/') or path.startswith('/api/charms/')):
        return True
    # Stock adjustment
    if method == 'POST' and ('/stock' in path):
        return True
    # Order approval, rejection, cancellation, status updates, edits, wipe, auto-wipe
    if method == 'POST' and (path.startswith('/api/orders/') or path == '/api/orders/wipe' or path == '/api/orders/auto-wipe/run') and any(action in path for action in ('/approve', '/reject', '/cancel', '/status', '/edit', '/wipe', '/auto-wipe')):
        return True
    # Points adjustment by admin
    if method == 'POST' and path.startswith('/api/users/') and path.endswith('/points'):
        return True
    return False

@app.before_request
def request_pipeline_middleware():
    """
    Core Security & Classification Middleware:
    1. Restricts Origin to allowed production/development domains
    2. Handles CORS Preflight (OPTIONS)
    3. Validates permissions via cryptographic signed token (NEVER trusts X-Client-Role)
    4. Guards administrative routes
    """
    g.start_time = time.time()
    g.request_id = str(uuid.uuid4())[:8]

    origin = request.headers.get('Origin')

    # --- 1. Origin Restriction Guard ---
    if origin and not is_origin_allowed(origin):
        return jsonify({
            'ok': False,
            'error': f'Forbidden: Origin {origin} is untrusted and rejected by CORS policy',
            'code': 'UNTRUSTED_ORIGIN'
        }), 403

    # --- 2. CORS Preflight Handling ---
    if request.method == 'OPTIONS':
        response = make_response('', 204)
        if origin and is_origin_allowed(origin):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Admin-Token, X-Request-ID'
        response.headers['Access-Control-Max-Age'] = '86400'
        return response

    path = request.path
    method = request.method

    # Static routes
    if not path.startswith('/api/'):
        g.client_type = 'static'
        g.is_admin = False
        return

    # --- 3. Server-Side Token Authentication (NEVER trust X-Client-Role) ---
    token = extract_token_from_request(request)
    claims = verify_signed_token(token) if token else None

    if claims and claims.get('role') == 'admin':
        g.client_type = 'admin'
        g.is_admin = True
        g.admin_claims = claims
    else:
        g.client_type = 'customer'
        g.is_admin = False
        g.admin_claims = None

    # --- 4. Role-Based Access Guard for Protected Administrative Routes ---
    public_auth_paths = {'/api/auth/exchange', '/api/admin/exchange', '/api/admin/verify-pin', '/api/admin/verify'}
    is_admin_path = is_administrative_route(path, method)

    if is_admin_path and path not in public_auth_paths:
        if not g.is_admin:
            return jsonify({
                'ok': False,
                'error': 'Unauthorized: Valid signed admin token required for this protected operation',
                'code': 'ADMIN_TOKEN_REQUIRED',
                'client_type': g.client_type,
                'request_id': g.request_id
            }), 401

@app.after_request
def response_pipeline_middleware(response):
    """
    Post-Request Telemetry, CORS & Security Headers Middleware:
    Stamps diagnostic headers and strictly enforces authorized CORS origin.
    """
    origin = request.headers.get('Origin')
    if origin and is_origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Admin-Token, X-Request-ID'
        response.headers['Access-Control-Expose-Headers'] = 'X-Client-Type, X-Request-ID, X-Response-Time-Ms'
        response.headers['Vary'] = 'Origin'

    # Security & Anti-Cloning Headers
    if os.environ.get('ENABLE_SECURITY_HEADERS', 'True').lower() in ('true', '1'):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' http: https: ws: wss:; "
            "frame-ancestors 'none'; "
            "object-src 'none';"
        )
        response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        if not request.path.startswith('/assets/') and not request.path.startswith('/_expo/'):
            response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'

    # High-Performance Caching Strategy
    if not request.path.startswith('/api/'):
        path_lower = request.path.lower()
        if '/_expo/' in path_lower or '/assets/' in path_lower or any(path_lower.endswith(ext) for ext in ('.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2')):
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        else:
            response.headers['Cache-Control'] = 'no-cache, must-revalidate'

    # Gzip Compression Middleware (<1ms in-memory compression)
    if (response.status_code == 200 and
        'gzip' in request.headers.get('Accept-Encoding', '').lower() and
        'Content-Encoding' not in response.headers):
        content_type = response.headers.get('Content-Type', '').lower()
        if any(t in content_type for t in ('text/', 'json', 'javascript', 'svg', 'xml')):
            try:
                response.direct_passthrough = False
                data = response.get_data()
                if len(data) >= 500:
                    compressed_data = gzip.compress(data, compresslevel=6)
                    response.set_data(compressed_data)
                    response.headers['Content-Encoding'] = 'gzip'
                    response.headers['Content-Length'] = len(compressed_data)
            except Exception:
                pass

    client_type = getattr(g, 'client_type', 'static')
    req_id = getattr(g, 'request_id', 'unknown')
    duration_ms = int((time.time() - getattr(g, 'start_time', time.time())) * 1000)

    response.headers['X-Client-Type'] = client_type
    response.headers['X-Request-ID'] = req_id
    response.headers['X-Response-Time-Ms'] = str(duration_ms)

    # Structured Audit Log in Terminal (Skip high-frequency sync polls to keep terminal I/O zero-latency)
    if request.path.startswith('/api/'):
        if request.path == '/api/sync/status' and response.status_code == 200:
            return response
        tag = '[ADMIN REQ]' if client_type == 'admin' else '[CUSTOMER REQ]'
        status = response.status_code
        print(f"{tag} {request.method} {request.path} -> {status} ({duration_ms}ms) [IP: {request.remote_addr}, ID: {req_id}]")

    return response


# ================================================================
# Static Page Routes (Customer Storefront Only)
# ================================================================

@app.route('/')
def index():
    if os.path.isdir(CUSTOMER_DIST_DIR) and os.path.isfile(os.path.join(CUSTOMER_DIST_DIR, 'index.html')):
        resp = make_response(send_from_directory(CUSTOMER_DIST_DIR, 'index.html'))
        resp.headers['Cache-Control'] = 'no-cache, must-revalidate'
        return resp
    if os.path.isfile(os.path.join(BASE_DIR, 'index.html')):
        return send_from_directory(BASE_DIR, 'index.html')
    return jsonify({
        'ok': True,
        'service': 'Somphea Reak Core API & Web Server',
        'status': 'active',
        'customer_front': 'http://localhost:8081',
        'admin_panel': 'http://localhost:8082',
        'hint': 'Run `./run_all.sh` to start Customer Front, Admin Panel, and this Backend API.'
    })

@app.route('/custom-bracelet')
@app.route('/custom-bracelet.html')
def custom_bracelet_page():
    return redirect('/#custom-bracelet')

# Admin Route: Serves standalone Admin Panel web build or redirects to dev port
@app.route('/admin')
@app.route('/admin/')
@app.route('/admin/index.html')
def admin_page():
    if os.path.isdir(ADMIN_DIST_DIR) and os.path.isfile(os.path.join(ADMIN_DIST_DIR, 'index.html')):
        resp = make_response(send_from_directory(ADMIN_DIST_DIR, 'index.html'))
        resp.headers['Cache-Control'] = 'no-cache, must-revalidate'
        return resp
    return redirect('http://localhost:8082')


# ================================================================
# API: High-Performance Live Sync & Version Status (<1ms response)
# ================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'ok': True,
        'status': 'healthy',
        'service': 'Somphea Reak API',
        'time': int(time.time())
    })

@app.route('/api/sync/status', methods=['GET'])
def get_sync_status():
    status = database.get_sync_status()
    return jsonify({
        'ok': True,
        **status
    })


# ================================================================
# API: Admin Authentication & Token Exchange Endpoint
# Exchanges verified PIN/password for a cryptographically signed Bearer token.
# ================================================================

@app.route('/api/auth/exchange', methods=['POST'])
@app.route('/api/admin/exchange', methods=['POST'])
@app.route('/api/admin/verify-pin', methods=['POST'])
@app.route('/api/admin/verify', methods=['POST'])
def exchange_token():
    ip = request.remote_addr or 'unknown'
    allowed, remaining = check_pin_rate_limit(ip)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many failed attempts. Security lock active for {remaining}s.',
            'locked': True,
            'retry_after': remaining
        }), 429

    data = request.json or {}
    pin = str(data.get('pin') or data.get('password') or '').strip()

    if database.verify_admin_pin(pin):
        record_success_pin(ip)
        now_ts = int(time.time())
        exp_ts = now_ts + TOKEN_LIFETIME_SECONDS
        payload = {
            'sub': 'admin',
            'role': 'admin',
            'jti': uuid.uuid4().hex,
            'iat': now_ts,
            'exp': exp_ts
        }
        token = create_signed_token(payload)
        return jsonify({
            'ok': True,
            'token': token,
            'token_type': 'Bearer',
            'role': 'admin',
            'expires_in': TOKEN_LIFETIME_SECONDS,
            'expires_at': exp_ts
        })
    else:
        record_failed_pin(ip)
        current_attempts = FAILED_PIN_ATTEMPTS.get(ip, {}).get('count', 0)
        attempts_left = max(0, MAX_PIN_ATTEMPTS - current_attempts)
        return jsonify({
            'ok': False,
            'error': 'Invalid PIN or credentials' if attempts_left > 0 else f'Too many failed attempts. Locked for {PIN_LOCK_WINDOW}s.',
            'attempts_left': attempts_left
        }), 401


# ================================================================
# API: Store Settings (Read: Public Customer, Write: Admin)
# ================================================================

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(database.get_settings())

@app.route('/api/settings', methods=['POST'])
@admin_required
def save_settings():
    patch = request.json or {}
    updated = database.save_settings(patch)
    return jsonify(updated)


# ================================================================
# API: Categories (Read: Public Customer, Write: Admin)
# ================================================================

@app.route('/api/categories', methods=['GET'])
def list_categories():
    return jsonify(database.get_categories())

@app.route('/api/categories', methods=['POST'])
@admin_required
def save_category():
    data = request.json or {}
    if not data.get('name') and not data.get('kh'):
        return jsonify({'error': 'Category name is required'}), 400
    cat = database.upsert_category(data)
    return jsonify(cat)

@app.route('/api/categories/<cat_id>', methods=['DELETE'])
@admin_required
def delete_category(cat_id):
    database.delete_category(cat_id)
    return jsonify({'ok': True})


# ================================================================
# API: Category Filters (Read: Public Customer, Write: Admin)
# ================================================================

@app.route('/api/category-filters', methods=['GET'])
@app.route('/api/category-filter', methods=['GET'])
@app.route('/api/category-filters/', methods=['GET'])
@app.route('/api/category-filter/', methods=['GET'])
def list_category_filters():
    category_id = request.args.get('category_id') or request.args.get('cat')
    filters = database.get_category_filters(category_id)
    return jsonify({'ok': True, 'filters': filters, 'data': filters})

@app.route('/api/category-filters', methods=['POST'])
@app.route('/api/category-filter', methods=['POST'])
@app.route('/api/category-filters/', methods=['POST'])
@app.route('/api/category-filter/', methods=['POST'])
@admin_required
def save_category_filter():
    data = request.json or {}
    if not data.get('name') and not data.get('name_km'):
        return jsonify({'error': 'Filter name is required'}), 400
    flt = database.upsert_category_filter(data)
    return jsonify({'ok': True, 'filter': flt})

@app.route('/api/category-filters/<filter_id>', methods=['DELETE'])
@app.route('/api/category-filter/<filter_id>', methods=['DELETE'])
@app.route('/api/category-filters/<filter_id>/', methods=['DELETE'])
@app.route('/api/category-filter/<filter_id>/', methods=['DELETE'])
@admin_required
def delete_category_filter(filter_id):
    success = database.delete_category_filter(filter_id)
    return jsonify({'ok': success})


# ================================================================
# API: Products (Read: Public Customer, Write: Admin)
# ================================================================

@app.route('/api/products', methods=['GET'])
def list_products():
    include_inactive = request.args.get('all', '0') in ('1', 'true')
    products = database.get_products(include_inactive)
    return jsonify(products)

@app.route('/api/products/<prod_id>', methods=['GET'])
def get_product(prod_id):
    p = database.get_product(prod_id)
    if not p:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify(p)

@app.route('/api/products', methods=['POST'])
@admin_required
def save_product():
    data = request.json or {}
    if not data.get('name') or data.get('price') is None:
        return jsonify({'ok': False, 'error': 'Name and price are required'}), 400
    p, err = database.upsert_product(data)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True, 'product': p, **p})

@app.route('/api/products/generate-id', methods=['GET'])
@admin_required
def get_generated_product_id():
    prefix = request.args.get('prefix', 'PRD').strip().upper() or 'PRD'
    new_id = database.generate_unique_product_id(prefix=prefix)
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/products/<prod_id>', methods=['DELETE'])
@admin_required
def delete_product(prod_id):
    database.delete_product(prod_id)
    return jsonify({'ok': True})

@app.route('/api/products/<prod_id>/stock', methods=['POST'])
@admin_required
def adjust_stock(prod_id):
    data = request.json or {}
    delta = int(data.get('delta', 0))
    p = database.adjust_stock(prod_id, delta)
    return jsonify(p)

@app.route('/api/products/seed', methods=['POST'])
@admin_required
def seed_catalog():
    products = database.seed_sample_products()
    return jsonify({'ok': True, 'count': len(products)})

@app.route('/api/products/clear', methods=['POST'])
@admin_required
def clear_catalog():
    database.clear_products()
    return jsonify({'ok': True})


# ================================================================
# API: Charms & Custom Italian Charm Studio Catalog
# ================================================================

@app.route('/api/products/custom_bracelet', methods=['GET'])
def get_custom_bracelet_catalog():
    charms = database.get_charms(include_inactive=False)
    cat_summary = database.get_charm_categories()
    categories_list = [{'name': c['category'], 'image': c['thumb']} for c in cat_summary]

    products_list = []
    for c in charms:
        products_list.append({
            'id': c['id'],
            'title': c['name'],
            'category': c['category'],
            'price': c['price'],
            'price_khr': c.get('price_khr') or int(round(c['price'] * 4100)),
            'stock': c['stock'],
            'image': c['image'],
            'thumbnail': c['image'],
            'model_no': c.get('model_no', ''),
            'color': c.get('color', 'Silver'),
            'variants': []
        })
    return jsonify({
        'categories': categories_list,
        'products': products_list
    })

@app.route('/api/charms', methods=['GET'])
def list_charms():
    include_inactive = request.args.get('all', '0') in ('1', 'true')
    category = request.args.get('cat')
    charms = database.get_charms(include_inactive, category)
    return jsonify(charms)

@app.route('/api/charms/<charm_id>', methods=['GET'])
def get_single_charm(charm_id):
    charm = database.get_charm(charm_id)
    if not charm:
        return jsonify({'error': 'Charm not found'}), 404
    return jsonify(charm)

@app.route('/api/charms', methods=['POST'])
@admin_required
def save_charm():
    data = request.json or {}
    if not data.get('name') or data.get('price') is None:
        return jsonify({'error': 'Charm name and price are required'}), 400
    charm = database.upsert_charm(data)
    return jsonify(charm)

@app.route('/api/charms/<charm_id>', methods=['DELETE'])
@admin_required
def delete_charm_item(charm_id):
    database.delete_charm(charm_id)
    return jsonify({'ok': True})

@app.route('/api/charms/<charm_id>/stock', methods=['POST'])
@admin_required
def adjust_charm_stock_item(charm_id):
    data = request.json or {}
    delta = data.get('delta')
    stock = data.get('stock')
    charm = database.adjust_charm_stock(charm_id, delta=delta, new_stock=stock)
    return jsonify(charm)

@app.route('/api/charms/seed', methods=['POST'])
@admin_required
def seed_charms_catalog():
    count = database.seed_default_charms()
    return jsonify({'ok': True, 'count': count})

@app.route('/api/charms/clear', methods=['POST'])
@admin_required
def clear_charms_catalog():
    database.clear_charms()
    return jsonify({'ok': True})

@app.route('/api/charms/categories', methods=['GET'])
def list_charm_categories():
    return jsonify(database.get_charm_categories())


# ================================================================
# API: Customer Promo Codes & Checkout
# ================================================================

@app.route('/api/check-promo', methods=['GET'])
def check_promo():
    ip = request.remote_addr or 'unknown'
    allowed, retry_after = check_action_rate_limit(f"promo:{ip}", max_requests=20, window_seconds=60)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many promo code checks. Please wait {retry_after}s before trying again.',
            'code': 'RATE_LIMITED'
        }), 429

    code = (request.args.get('code') or '').strip().upper()[:30]
    if code in ('SOMPHEA', 'SALE10', 'STUDIO10'):
        return jsonify({'ok': True, 'code': code, 'discountPercent': 10, 'discountAmount': 0})
    if code in ('VIP20', 'REAK20'):
        return jsonify({'ok': True, 'code': code, 'discountPercent': 20, 'discountAmount': 0})
    if code in ('SAVE2000', 'BOXFREE'):
        return jsonify({'ok': True, 'code': code, 'discountPercent': 0, 'discountAmount': 2000})
    return jsonify({'ok': False, 'error': 'Invalid or expired promo code'}), 404

@app.route('/api/checkout', methods=['POST'])
def universal_checkout():
    ip = request.remote_addr or 'unknown'
    allowed, retry_after = check_action_rate_limit(f"checkout:{ip}", max_requests=15, window_seconds=60)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many orders placed. Please wait {retry_after}s before submitting again.',
            'code': 'RATE_LIMITED'
        }), 429

    data = request.json or {}
    items = data.get('items', [])
    if not items or not isinstance(items, list) or len(items) == 0:
        return jsonify({'ok': False, 'error': 'Order must contain at least one valid item', 'code': 'EMPTY_ITEMS'}), 400

    name = str(data.get('customer_name') or data.get('name') or '').strip()[:100] or 'Customer'
    phone = str(data.get('phone') or '').strip()[:30]
    address = str(data.get('address') or '').strip()[:300]
    province = str(data.get('province') or '').strip()[:100]
    notes = str(data.get('notes') or data.get('note') or '').strip()[:500]

    try:
        subtotal = max(0.0, float(data.get('subtotal') or data.get('total', 0)))
        discount = max(0.0, float(data.get('discount', 0)))
        delivery = max(0.0, float(data.get('delivery', 0)))
        total = max(0.0, float(data.get('total') or (subtotal - discount + delivery)))
    except (ValueError, TypeError):
        return jsonify({'ok': False, 'error': 'Invalid numeric amount values', 'code': 'BAD_AMOUNT'}), 400

    # Calculate earned points server-side based on verified items or payload (capped securely)
    calculated_pts = 0
    for itm in items:
        if isinstance(itm, dict):
            qty = max(1, min(100, int(itm.get('qty', 1))))
            pt_val = max(1, min(20, int(itm.get('pt') or itm.get('points') or 1)))
            calculated_pts += pt_val * qty
    payload_pts = int(data.get('earned_points') or data.get('earned') or 0)
    earned = max(calculated_pts, payload_pts, 1)
    earned = min(earned, 500)

    raw_promo = data.get('voucher') or data.get('voucher_code') or data.get('redeemCode') or ''
    promo = str(raw_promo).strip()[:50]
    if promo.lower() in ('null', 'none', 'undefined', 'false', '0'):
        promo = ''

    voucher_pct = 0
    try:
        voucher_pct = float(data.get('voucher_pct') or 0)
    except (ValueError, TypeError):
        voucher_pct = 0
    if voucher_pct <= 0 and discount > 0 and subtotal > 0:
        voucher_pct = round((discount / subtotal) * 100)

    tg_user = data.get('telegram_user') or {}
    payment = str(data.get('payment_method') or data.get('payment') or (data.get('contact') or {}).get('payment') or 'ABA KHQR (Scan to Pay)')[:80]

    raw_username = data.get('telegram_username') or tg_user.get('username') or name
    username = str(raw_username).strip().replace('@', '')[:60] or 'customer'
    user = database.upsert_user(username, phone)

    full_address = f"{address}, {province}".strip(', ') if province and province not in address else address

    order_data = {
        'user_id': user['id'],
        'customer_name': name,
        'telegram_username': username,
        'phone': phone,
        'address': full_address,
        'notes': notes,
        'items': items,
        'subtotal': subtotal,
        'discount': discount,
        'delivery': delivery,
        'total': total,
        'earned': earned,
        'voucher': promo,
        'voucher_code': promo,
        'voucher_pct': voucher_pct,
        'payment': payment,
        'payment_method': payment,
        'contact': {
            'name': name,
            'phone': phone,
            'address': full_address,
            'telegram': username,
            'payment': payment,
            'notes': notes,
            'voucher': promo,
            'voucher_code': promo,
            'voucher_pct': voucher_pct,
            'discount': discount,
            'subtotal': subtotal,
            'total': total
        }
    }
    order = database.place_order(order_data)
    return jsonify({'ok': True, 'order_id': order['id'], 'order': order})


# ================================================================
# API: Telegram MTProto Username Resolution
# ================================================================

try:
    from telegram_resolver import resolver as tg_resolver
except ImportError:
    tg_resolver = None

@app.route('/api/telegram/check', methods=['GET', 'POST'])
@app.route('/api/telegram/resolve', methods=['GET', 'POST'])
def check_telegram_username():
    """
    Checks if a Telegram username actually exists via MTProto contacts.resolveUsername.
    Accepts:
      - GET /api/telegram/check?username=@john_doe
      - POST /api/telegram/check with JSON {"username": "@john_doe"}
    Returns:
      { "exists": true, "type": "user" } or { "exists": false }
    """
    if not tg_resolver:
        return jsonify({'exists': False, 'error': 'RESOLVER_UNAVAILABLE'}), 500

    if request.method == 'POST':
        body = request.get_json(silent=True) or {}
        raw_username = body.get('username') or request.args.get('username', '')
    else:
        raw_username = request.args.get('username', '')

    if not raw_username:
        return jsonify({
            'exists': False,
            'error': 'MISSING_USERNAME',
            'message': 'Username query param or JSON field is required'
        }), 400

    res = tg_resolver.resolve(raw_username)

    # Handle FLOOD_WAIT rate limiting
    if res.get('error') == 'FLOOD_WAIT':
        resp = make_response(jsonify(res), 429)
        resp.headers['Retry-After'] = str(res.get('retry_after', 60))
        return resp

    # Handle server configuration state
    if res.get('error') == 'NOT_CONFIGURED':
        return jsonify(res), 503

    return jsonify(res)


# ================================================================
# API: Users & Loyalty Points
# ================================================================

@app.route('/api/users/register', methods=['POST'])
@app.route('/api/customer/register', methods=['POST'])
def user_register():
    ip = request.remote_addr or 'unknown'
    allowed, retry_after = check_action_rate_limit(f"reg:{ip}", max_requests=20, window_seconds=60)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many registration requests. Please wait {retry_after}s before trying again.',
            'code': 'RATE_LIMITED'
        }), 429

    data = request.json or {}
    username = str(data.get('username') or data.get('tlg_username') or '').strip()
    phone = str(data.get('phone') or data.get('tlg_phone') or '').strip()
    password = str(data.get('password') or '').strip()

    if not username:
        return jsonify({'ok': False, 'error': 'Telegram username is required'}), 400
    if not password:
        return jsonify({'ok': False, 'error': 'Password is required'}), 400

    u, err = database.register_customer(username, phone, password)
    if err:
        return jsonify({'ok': False, 'error': err}), 400

    return jsonify({
        'ok': True,
        'user': u,
        **u
    })

@app.route('/api/users/login', methods=['POST'])
@app.route('/api/customer/login', methods=['POST'])
def user_login():
    ip = request.remote_addr or 'unknown'
    allowed, retry_after = check_action_rate_limit(f"login:{ip}", max_requests=25, window_seconds=60)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many login requests. Please wait {retry_after}s before trying again.',
            'code': 'RATE_LIMITED'
        }), 429

    data = request.json or {}
    identifier = str(data.get('identifier') or data.get('phone') or data.get('username') or data.get('name') or '').strip()
    password = str(data.get('password') or '').strip()

    # If password is provided, use password authentication
    if password:
        u, err = database.login_customer(identifier, password)
        if err:
            return jsonify({'ok': False, 'error': err}), 401
        return jsonify({
            'ok': True,
            'user': u,
            **u
        })

    # Fallback to direct identifier login for backward compatibility
    raw_username = identifier.replace('@', '')[:60]
    phone = str(data.get('phone', '')).strip()[:30]
    if not raw_username:
        return jsonify({'ok': False, 'error': 'Valid username or phone required'}), 400
    u = database.upsert_user(raw_username, phone)
    return jsonify({
        'ok': True,
        'user': u,
        **u
    })

@app.route('/api/users/recover', methods=['POST'])
@app.route('/api/customer/recover', methods=['POST'])
def user_recover():
    ip = request.remote_addr or 'unknown'
    allowed, retry_after = check_action_rate_limit(f"recover:{ip}", max_requests=10, window_seconds=60)
    if not allowed:
        return jsonify({
            'ok': False,
            'error': f'Too many recovery requests. Please wait {retry_after}s before trying again.',
            'code': 'RATE_LIMITED'
        }), 429

    data = request.json or {}
    identifier = str(data.get('phone') or data.get('username') or data.get('identifier') or '').strip()
    new_password = str(data.get('new_password') or data.get('password') or '').strip()

    if not identifier:
        return jsonify({'ok': False, 'error': 'Phone number or Telegram username is required'}), 400
    if not new_password:
        return jsonify({'ok': False, 'error': 'New password is required'}), 400

    u, err = database.recover_customer_password(identifier, new_password)
    if err:
        return jsonify({'ok': False, 'error': err}), 400

    return jsonify({
        'ok': True,
        'user': u,
        'message': 'Password updated successfully',
        **u
    })

@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):
    u = database.get_user(user_id)
    if not u:
        return jsonify({'ok': False, 'error': 'User not found'}), 404
    return jsonify({
        'ok': True,
        'user': u,
        **u
    })

@app.route('/api/users', methods=['GET'])
@admin_required
def list_users():
    return jsonify(database.get_users())

@app.route('/api/users/<user_id>/points', methods=['POST'])
@admin_required
def adjust_points(user_id):
    data = request.json or {}
    delta = int(data.get('delta', 0))
    reason = str(data.get('reason', 'Adjustment'))[:100]
    u = database.add_user_points(user_id, delta, reason)
    return jsonify(u)

@app.route('/api/users/<user_id>', methods=['POST'])
def update_user_profile(user_id):
    data = request.json or {}
    # Security: If caller is not an authenticated admin, restrict updates strictly to name and phone
    if not getattr(g, 'is_admin', False):
        safe_data = {}
        if 'name' in data:
            safe_data['name'] = str(data['name'])[:100].strip()
        if 'phone' in data:
            safe_data['phone'] = str(data['phone'])[:30].strip()
        data = safe_data
    u = database.update_user(user_id, data)
    return jsonify(u)

@app.route('/api/users/<user_id>/redeem-voucher', methods=['POST'])
def redeem_voucher(user_id):
    voucher, err = database.redeem_voucher(user_id)
    if err:
        return jsonify({'error': err}), 400
    u = database.get_user(user_id)
    return jsonify({'voucher': voucher, 'user': u})


# ================================================================
# API: Orders Desk (Customer Placement & Admin Processing)
# ================================================================

@app.route('/api/orders', methods=['GET'])
def list_orders():
    user_id = request.args.get('user_id')
    # If no user_id query is specified:
    if not user_id:
        # If caller is admin, return full database orders list
        if getattr(g, 'is_admin', False):
            orders = database.get_orders(None)
            return jsonify({'ok': True, 'orders': orders, 'data': orders})
        # If caller is a customer or guest without user_id, return empty list safely (no 401 crash)
        return jsonify({'ok': True, 'orders': [], 'data': []})

    orders = database.get_orders(user_id)
    return jsonify({'ok': True, 'orders': orders, 'data': orders})

@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    o = database.get_order(order_id)
    if not o:
        return jsonify({'error': 'Order not found'}), 404
    return jsonify(o)

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json or {}
    if not data.get('user_id') or not data.get('items'):
        return jsonify({'error': 'user_id and items are required'}), 400
    order = database.place_order(data)
    return jsonify(order)

@app.route('/api/orders/<order_id>/approve', methods=['POST'])
@admin_required
def approve_order(order_id):
    order, err = database.approve_order(order_id)
    if err:
        return jsonify({'error': err}), 400
    return jsonify(order)

@app.route('/api/orders/<order_id>/reject', methods=['POST'])
@admin_required
def reject_order(order_id):
    data = request.json or {}
    note = data.get('note', 'Item out of stock')
    order, err = database.reject_order(order_id, note)
    if err:
        return jsonify({'error': err}), 400
    return jsonify(order)

@app.route('/api/orders/<order_id>/cancel', methods=['POST'])
@admin_required
def cancel_order(order_id):
    data = request.json or {}
    reason = data.get('reason', 'Cancelled by admin')
    order, err = database.cancel_order(order_id, reason)
    if err:
        return jsonify({'error': err}), 400
    return jsonify(order)

@app.route('/api/orders/<order_id>/status', methods=['POST'])
@admin_required
def update_status(order_id):
    data = request.json or {}
    status = data.get('status', 'Shipped')
    order = database.set_order_status(order_id, status)
    return jsonify(order)

@app.route('/api/orders/<order_id>/edit', methods=['POST', 'PUT'])
@admin_required
def edit_order_receipt(order_id):
    data = request.json or {}
    order, err = database.update_order(order_id, data)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True, 'order': order, **order})

@app.route('/api/orders/wipe', methods=['POST'])
@admin_required
def wipe_orders_history():
    data = request.json or {}
    mode = data.get('mode', 'all')
    deleted_count = database.wipe_orders(mode=mode)
    return jsonify({
        'ok': True,
        'deleted_count': deleted_count,
        'message': f"Successfully wiped {deleted_count} orders ({mode})"
    })

@app.route('/api/orders/auto-wipe/run', methods=['POST'])
@admin_required
def run_orders_auto_wipe():
    purged_count, msg = database.run_auto_wipe_orders()
    return jsonify({
        'ok': True,
        'purged_count': purged_count,
        'message': msg
    })


# ================================================================
# API: Notifications
# ================================================================

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = request.args.get('user_id')
    notifs = database.get_notifications(user_id)
    return jsonify(notifs)

@app.route('/api/notifications/read', methods=['POST'])
def read_notifications():
    data = request.json or {}
    order_id = data.get('order_id')
    database.mark_notifications_read(order_id)
    return jsonify({'ok': True})


# ================================================================
# API: Admin Dashboard Telemetry & Stats
# ================================================================

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    orders = database.get_orders()
    products = database.get_products()
    charms = database.get_charms()
    users = database.get_users()
    approved_revenue = sum(float(o.get('total', 0) or 0) for o in orders if o.get('status') in ('Approved', 'Shipped', 'Delivered'))
    pending_orders = sum(1 for o in orders if o.get('status') == 'Pending')
    return jsonify({
        'ok': True,
        'total_orders': len(orders),
        'pending_orders': pending_orders,
        'total_products': len(products),
        'total_charms': len(charms),
        'total_users': len(users),
        'revenue': round(approved_revenue, 2),
        'server_time': int(time.time())
    })


# ================================================================
# Fallback Static File Handler
# ================================================================

# Allowed and blocked file extensions / assets for static file serving
BLOCKED_STATIC_EXTENSIONS = {
    '.env', '.db', '.sqlite', '.sqlite3', '.py', '.pyc', '.pyo', '.pyd',
    '.sh', '.bash', '.log', '.git', '.md', '.bak', '.conf', '.ini',
    '.pem', '.key', '.crt', '.sql', '.yaml', '.yml', '.tar', '.gz', '.zip', '.txt'
}
ALLOWED_STATIC_EXTENSIONS = {
    '.html', '.js', '.jsx', '.ts', '.tsx', '.css', '.png', '.jpg', '.jpeg',
    '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot',
    '.otf', '.json', '.map', '.mp3', '.wav', '.mp4'
}
ALLOWED_BASE_DIR_ASSETS = {
    'logo.jpg', 'logo-dark.jpg', 'logo-light.png', 'charm_clean.png', 'favicon.ico', 'telegram_app.png'
}

@app.route('/<path:filename>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def serve_static(filename):
    if filename.startswith('api/'):
        return jsonify({'ok': False, 'error': f'API endpoint /{filename} not found', 'code': 'NOT_FOUND'}), 404

    if request.method not in ('GET', 'HEAD'):
        return jsonify({'ok': False, 'error': f'Method {request.method} not allowed for static files', 'code': 'METHOD_NOT_ALLOWED'}), 405

    # Security Check: Reject null bytes, backslashes, or path traversal attempts
    if '\x00' in filename or '\\' in filename:
        return jsonify({'ok': False, 'error': 'Invalid file request', 'code': 'FORBIDDEN'}), 403

    # Normalize path and check for traversal (use forward slashes for cross-platform Werkzeug compatibility)
    clean_path = os.path.normpath(filename).replace('\\', '/').lstrip('/')
    if clean_path.startswith('..') or '/..' in clean_path:
        return jsonify({'ok': False, 'error': 'Path traversal blocked', 'code': 'FORBIDDEN'}), 403

    # Security Check: Block dotfiles or hidden files (.env, .git, etc.)
    path_parts = [p for p in clean_path.split('/') if p]
    if any(part.startswith('.') for part in path_parts):
        return jsonify({'ok': False, 'error': 'Access to hidden or protected system files is forbidden', 'code': 'FORBIDDEN'}), 403

    base_name = os.path.basename(clean_path).lower()
    ext = os.path.splitext(base_name)[1]

    # Security Check: Block sensitive extensions
    if ext in BLOCKED_STATIC_EXTENSIONS or 'sompheareak.db' in base_name or '.env' in base_name:
        return jsonify({'ok': False, 'error': 'Access to database, source code, or configuration files is strictly forbidden', 'code': 'FORBIDDEN'}), 403

    # 1. Check in customer-front and admin-panel dist directories (pre-built production web bundles)
    for candidate_dist in (CUSTOMER_DIST_DIR, ADMIN_DIST_DIR):
        if candidate_dist and os.path.isdir(candidate_dist):
            try:
                target = os.path.abspath(os.path.join(candidate_dist, clean_path))
                if os.path.commonpath([target, os.path.abspath(candidate_dist)]) == os.path.abspath(candidate_dist):
                    if os.path.isfile(target) and ext in ALLOWED_STATIC_EXTENSIONS:
                        return send_from_directory(candidate_dist, clean_path)
            except Exception:
                pass

    # 2. Check in BASE_DIR — ONLY explicit whitelist of static media images
    if base_name in ALLOWED_BASE_DIR_ASSETS and '/' not in clean_path:
        target = os.path.join(BASE_DIR, base_name)
        if os.path.isfile(target):
            return send_from_directory(BASE_DIR, base_name)

    # 3. Check in project assets/ directory
    root_assets_dir = os.path.abspath(os.path.join(os.path.dirname(BASE_DIR), 'assets'))
    if os.path.isdir(root_assets_dir):
        try:
            target = os.path.abspath(os.path.join(root_assets_dir, clean_path))
            if os.path.commonpath([target, root_assets_dir]) == root_assets_dir:
                if os.path.isfile(target) and ext in ALLOWED_STATIC_EXTENSIONS:
                    return send_from_directory(root_assets_dir, clean_path)
        except Exception:
            pass

    # 4. SPA client-side route fallback (e.g. /custom-bracelet, /cart, /admin, /rewards)
    if '.' not in base_name:
        return index()

    return jsonify({'ok': False, 'error': f'File not found: {filename}', 'code': 'NOT_FOUND'}), 404

@app.errorhandler(400)
def handle_400(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': getattr(e, 'description', 'Bad request'), 'code': 'BAD_REQUEST'}), 400
    return jsonify({'ok': False, 'error': 'Bad request'}), 400

@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': f'Endpoint not found: {request.path}', 'code': 'NOT_FOUND'}), 404
    return index()

@app.errorhandler(405)
def handle_405(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': f'Method {request.method} not allowed for {request.path}', 'code': 'METHOD_NOT_ALLOWED'}), 405
    return jsonify({'ok': False, 'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def handle_500(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': 'Internal server error', 'code': 'SERVER_ERROR'}), 500
    return jsonify({'ok': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    preferred_port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() in ('true', '1')

    import socket
    port = preferred_port
    while port < preferred_port + 20:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', port))
            break
        except OSError:
            port += 1

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as _s:
            _s.connect(('8.8.8.8', 80))
            lan_ip = _s.getsockname()[0]
    except Exception:
        lan_ip = '127.0.0.1'

    print("=" * 65)
    print(f">> Somphea Reak Core API running on:")
    print(f">>   - Local:  http://127.0.0.1:{port}")
    print(f">>   - Wi-Fi:  http://{lan_ip}:{port}  (For Expo Go on Phone)")
    if port != preferred_port:
        print(f">> (Port {preferred_port} was occupied, automatically shifted to {port})")
    print(f">> Middleware Active: Customer & Admin Request Separation & Auth Guard")
    print(f">> Shared Database: sompheareak.db (SQLite)")
    print("=" * 65)
    app.run(host='0.0.0.0', port=port, debug=debug, threaded=True)

