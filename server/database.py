import sqlite3
import json
import os
import uuid
import hashlib
import hmac
from datetime import datetime

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    def generate_password_hash(password, method='pbkdf2_sha256', salt_length=16):
        salt = os.urandom(salt_length)
        iterations = 260000
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations)
        return f"{method}${iterations}${salt.hex()}${digest.hex()}"

    def check_password_hash(pwhash, password):
        if not pwhash or not isinstance(pwhash, str):
            return False
        try:
            method, iterations, salt_hex, expected_hex = pwhash.split('$', 3)
            if method != 'pbkdf2_sha256':
                return False
            salt = bytes.fromhex(salt_hex)
            expected = bytes.fromhex(expected_hex)
            actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iterations))
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

# --- Environment Variable & Secrets Loading ---
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    _env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(_env_file):
        with open(_env_file, 'r', encoding='utf-8') as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith('#') and '=' in _line:
                    _k, _v = _line.split('=', 1)
                    os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

def _resolve_db_path():
    env_p = os.environ.get('DATABASE_PATH')
    if env_p:
        if os.path.isabs(env_p):
            return env_p
        root_cand = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env_p)
        if os.path.exists(root_cand):
            return root_cand
        server_cand = os.path.join(os.path.dirname(os.path.abspath(__file__)), env_p)
        if os.path.exists(server_cand):
            return server_cand
        return root_cand
    root_default = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sompheareak.db')
    if os.path.exists(root_default):
        return root_default
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sompheareak.db')

DB_PATH = _resolve_db_path()

DEFAULT_SETTINGS = {
    'site_title': os.environ.get('SITE_TITLE', 'សម្ភារៈ - Somphea Reak'),
    'subtitle': os.environ.get('SITE_SUBTITLE', 'Premium Studio'),
    'tagline': os.environ.get('TAGLINE', 'Cambodia Kingdom of Wonder'),
    'delivery_fee': float(os.environ.get('DELIVERY_FEE', 1.5)),
    'voucher_cost': int(os.environ.get('VOUCHER_COST', 25)),
    'voucher_pct': int(os.environ.get('VOUCHER_PCT', 10)),
    'custom_base_price': float(os.environ.get('CUSTOM_BASE_PRICE', 8.0)),
    'charm_price': float(os.environ.get('CHARM_PRICE', 0.75)),
    'custom_premium_pkg': float(os.environ.get('CUSTOM_PREMIUM_PKG', 0.5)),
    'custom_pt': int(os.environ.get('CUSTOM_PT', 5)),
    'site_logo': 'logo.jpg',
    'charms': json.dumps(['❤️','⭐','🌸','🦋','🐱','🍀','🌙','☀️','💎','🎀','🐶','🌈','⚽','🎵','🇰🇭','🔤','⚡','👑']),
    'announcement': '✨ Welcome to Somphea Reak Studio • Verified Telegram Orders • Earn Points on Every Item!',
    'seller_telegram': os.environ.get('SELLER_TELEGRAM', 'sompheareak'),
    'free_delivery_normal_enabled': int(os.environ.get('FREE_DELIVERY_NORMAL_ENABLED', 0)),
    'free_delivery_threshold': float(os.environ.get('FREE_DELIVERY_THRESHOLD', 0.0)),
    'auto_wipe_enabled': os.environ.get('AUTO_WIPE_ENABLED', 'false'),
    'auto_wipe_days': int(os.environ.get('AUTO_WIPE_DAYS', 30)),
    'auto_wipe_scope': os.environ.get('AUTO_WIPE_SCOPE', 'completed_only'),
    'auto_wipe_last_run': ''
}

DEFAULT_CATEGORIES = [
    {
        'id': 'minifigure',
        'name': 'Minifigure',
        'kh': 'MINIFIGURE',
        'en': 'Collectible mini figures',
        'icon': '🧸',
        'grad': 'linear-gradient(135deg,#06b6d4,#3b82f6)',
        'sort_order': 1
    },
    {
        'id': 'toy-universe',
        'name': 'Toy Universe',
        'kh': 'TOY',
        'en': 'Toy universe',
        'icon': '🪀',
        'grad': 'linear-gradient(135deg,#f97316,#ec4899)',
        'sort_order': 2
    },
    {
        'id': 'bracelet',
        'name': 'Ready-Made Bracelet',
        'kh': 'Bracelet for Female&Male',
        'en': 'Ready-made bracelets',
        'icon': '📿',
        'grad': 'linear-gradient(135deg,#22c55e,#14b8a6)',
        'sort_order': 3
    }
]

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn

def init_db():
    conn = get_db()
    conn.execute("PRAGMA journal_mode = WAL")
    c = conn.cursor()

    # Sync versions table for high-performance delta polling
    c.execute('''
        CREATE TABLE IF NOT EXISTS sync_versions (
            entity TEXT PRIMARY KEY,
            version INTEGER DEFAULT 1,
            updated_at TEXT
        )
    ''')
    for ent in ('settings', 'categories', 'category_filters', 'products', 'charms', 'orders', 'users', 'notifications'):
        c.execute('INSERT OR IGNORE INTO sync_versions (entity, version, updated_at) VALUES (?, 1, ?)', (ent, datetime.now().isoformat()))

    # Settings table
    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            val TEXT
        )
    ''')

    # Insert default settings if not exists
    for k, v in DEFAULT_SETTINGS.items():
        c.execute('INSERT OR IGNORE INTO settings (key, val) VALUES (?, ?)', (k, str(v)))

    # Admin Credentials / Auth Hash Table (stores hashed password secrets only)
    c.execute('''
        CREATE TABLE IF NOT EXISTS admin_auth (
            id INTEGER PRIMARY KEY,
            password_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    # Initialize / sync admin PIN as a salted cryptographic hash
    target_pin = os.environ.get('ADMIN_PIN', 'Sompheareak.com04/10/2026-Ming')
    c.execute('SELECT password_hash FROM admin_auth WHERE id = 1')
    auth_row = c.fetchone()
    if not auth_row:
        c.execute('INSERT INTO admin_auth (id, password_hash, updated_at) VALUES (1, ?, ?)',
                  (generate_password_hash(target_pin), datetime.now().isoformat()))
    elif os.environ.get('ADMIN_PIN') and not check_password_hash(auth_row['password_hash'], target_pin):
        c.execute('UPDATE admin_auth SET password_hash = ?, updated_at = ? WHERE id = 1',
                  (generate_password_hash(target_pin), datetime.now().isoformat()))

    # Hard security cleanup: remove any legacy plaintext PINs from public settings table
    c.execute("DELETE FROM settings WHERE key IN ('admin_pin', 'adminPin')")

    # Categories table
    c.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kh TEXT NOT NULL,
            en TEXT,
            icon TEXT DEFAULT '🛍️',
            grad TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT
        )
    ''')

    # Seed default categories if none exist
    c.execute('SELECT COUNT(*) as cnt FROM categories')
    if c.fetchone()['cnt'] == 0:
        for cat in DEFAULT_CATEGORIES:
            c.execute('''
                INSERT INTO categories (id, name, kh, en, icon, grad, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (cat['id'], cat['name'], cat['kh'], cat['en'], cat['icon'], cat['grad'], cat['sort_order'], datetime.now().isoformat()))

    # Category filters table (dynamic subcategory & tag filters per category)
    c.execute('''
        CREATE TABLE IF NOT EXISTS category_filters (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_km TEXT,
            match_keywords TEXT DEFAULT '',
            product_ids TEXT DEFAULT '[]',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT
        )
    ''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_cat_filters_cat ON category_filters(category_id)')

    # Products table
    c.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cat TEXT NOT NULL,
            price REAL NOT NULL,
            discount REAL DEFAULT 0,
            stock INTEGER DEFAULT 0,
            pt INTEGER DEFAULT 1,
            image TEXT,
            active INTEGER DEFAULT 1,
            bio TEXT,
            created_at TEXT
        )
    ''')

    # Migration: Ensure bio and free_delivery columns exist on products
    try:
        c.execute("PRAGMA table_info(products)")
        existing_prod_cols = [r['name'] for r in c.fetchall()]
        if 'bio' not in existing_prod_cols:
            c.execute("ALTER TABLE products ADD COLUMN bio TEXT")
        if 'free_delivery' not in existing_prod_cols:
            c.execute("ALTER TABLE products ADD COLUMN free_delivery INTEGER DEFAULT 0")
    except Exception as e:
        pass

    # Users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            phone TEXT,
            name TEXT,
            password_hash TEXT,
            points INTEGER DEFAULT 0,
            vouchers TEXT DEFAULT '[]',
            point_log TEXT DEFAULT '[]',
            created_at TEXT
        )
    ''')

    # Migration: Ensure password_hash exists on existing databases
    try:
        c.execute("PRAGMA table_info(users)")
        existing_user_cols = [r['name'] for r in c.fetchall()]
        if 'password_hash' not in existing_user_cols:
            c.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    except Exception as e:
        pass

    # Orders table
    c.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            items TEXT NOT NULL,
            subtotal REAL NOT NULL,
            discount REAL DEFAULT 0,
            delivery REAL DEFAULT 0,
            total REAL NOT NULL,
            earned INTEGER DEFAULT 0,
            voucher TEXT,
            status TEXT DEFAULT 'Pending',
            contact TEXT NOT NULL,
            note TEXT,
            created_at TEXT,
            decided_at TEXT,
            points_awarded INTEGER DEFAULT 0
        )
    ''')

    # Migration: Ensure points_awarded exists on existing orders
    try:
        c.execute("PRAGMA table_info(orders)")
        existing_order_cols = [r['name'] for r in c.fetchall()]
        if 'points_awarded' not in existing_order_cols:
            c.execute("ALTER TABLE orders ADD COLUMN points_awarded INTEGER DEFAULT 0")
    except Exception as e:
        pass

    # Notifications table
    c.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            type TEXT,
            order_id TEXT,
            user_id TEXT,
            text TEXT,
            read INTEGER DEFAULT 0,
            created_at TEXT
        )
    ''')

    # Charms table (Italy Charm Bracelet Links & Customizer Studio)
    c.execute('''
        CREATE TABLE IF NOT EXISTS charms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0.75,
            price_khr INTEGER DEFAULT 3000,
            stock INTEGER DEFAULT 99,
            image TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            model_no TEXT,
            color TEXT DEFAULT 'Silver',
            created_at TEXT
        )
    ''')

    # Migration check for model_no & color in existing charms table
    c.execute("PRAGMA table_info(charms)")
    _charm_cols = [r['name'] for r in c.fetchall()]
    if 'model_no' not in _charm_cols:
        c.execute("ALTER TABLE charms ADD COLUMN model_no TEXT")
    if 'color' not in _charm_cols:
        c.execute("ALTER TABLE charms ADD COLUMN color TEXT DEFAULT 'Silver'")

    # Auto-seed sample catalog if products table is empty (ensures clean clone starts with full catalog)
    c.execute('SELECT COUNT(*) as cnt FROM products')
    has_prods = c.fetchone()['cnt'] > 0

    c.execute('SELECT COUNT(*) as cnt FROM charms')
    has_charms = c.fetchone()['cnt'] > 0

    conn.commit()
    conn.close()

    # Do not auto-seed empty store; catalog is intentionally cleared per admin design

def now():
    return datetime.now().isoformat()

def bump_version(entity, conn=None):
    """Atomically increment the change version counter for a given entity."""
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True
    c = conn.cursor()
    c.execute('''
        INSERT INTO sync_versions (entity, version, updated_at)
        VALUES (?, 1, ?)
        ON CONFLICT(entity) DO UPDATE SET version = version + 1, updated_at = ?
    ''', (entity, now(), now()))
    if should_close:
        conn.commit()
        conn.close()

def get_sync_status():
    """Return lightweight version markers and live badge counters (<1ms query)."""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT entity, version FROM sync_versions')
    versions = {r['entity']: r['version'] for r in c.fetchall()}
    for ent in ('settings', 'categories', 'category_filters', 'products', 'charms', 'orders', 'users', 'notifications'):
        if ent not in versions:
            versions[ent] = 1

    c.execute("SELECT COUNT(*) as cnt FROM orders WHERE status = 'Pending'")
    pending_orders = c.fetchone()['cnt']

    c.execute("SELECT COUNT(*) as cnt FROM orders")
    total_orders = c.fetchone()['cnt']

    c.execute("SELECT COUNT(*) as cnt FROM notifications WHERE read = 0")
    unread_notifs = c.fetchone()['cnt']

    conn.close()
    return {
        'versions': versions,
        'meta': {
            'pending_orders': pending_orders,
            'total_orders': total_orders,
            'unread_notifs': unread_notifs,
            'server_time': int(datetime.now().timestamp())
        }
    }

# --- Admin Authentication & Hash Management ---
_CACHED_ADMIN_HASH = None

def verify_admin_pin(pin: str) -> bool:
    """Validate candidate PIN/password against salted cryptographic hash in database with constant-time verification."""
    global _CACHED_ADMIN_HASH
    if not pin:
        return False
    candidate = str(pin).strip()
    target_pin = os.environ.get('ADMIN_PIN', '').strip()

    if _CACHED_ADMIN_HASH is None:
        conn = get_db()
        c = conn.cursor()
        c.execute('SELECT password_hash FROM admin_auth WHERE id = 1')
        row = c.fetchone()
        conn.close()
        if row and row['password_hash']:
            _CACHED_ADMIN_HASH = row['password_hash']

    if _CACHED_ADMIN_HASH:
        try:
            return check_password_hash(_CACHED_ADMIN_HASH, candidate)
        except Exception:
            return False

    if target_pin:
        import hmac
        return hmac.compare_digest(candidate, target_pin)

    return False

def set_admin_pin(new_pin: str) -> bool:
    """Store admin PIN as salted cryptographic hash."""
    global _CACHED_ADMIN_HASH
    pin_clean = str(new_pin).strip()
    if not pin_clean or len(pin_clean) < 4:
        return False
    p_hash = generate_password_hash(pin_clean)
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO admin_auth (id, password_hash, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET password_hash = ?, updated_at = ?
    ''', (p_hash, now(), p_hash, now()))
    c.execute("DELETE FROM settings WHERE key IN ('admin_pin', 'adminPin')")
    conn.commit()
    conn.close()
    _CACHED_ADMIN_HASH = p_hash
    return True

# --- Settings ---
def get_settings():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT key, val FROM settings')
    rows = c.fetchall()
    conn.close()

    res = dict(DEFAULT_SETTINGS)
    for r in rows:
        k, v = r['key'], r['val']
        if k in ('delivery_fee', 'custom_base_price', 'charm_price'):
            try: res[k] = float(v)
            except: res[k] = 0.0
        elif k in ('voucher_cost', 'voucher_pct', 'custom_pt'):
            try: res[k] = int(float(v))
            except: res[k] = 0
        elif k == 'charms':
            try: res[k] = json.loads(v)
            except: res[k] = DEFAULT_SETTINGS['charms']
        else:
            res[k] = v

    # Security sanitize: never expose credentials or hashes in public settings
    res.pop('admin_pin', None)
    res.pop('adminPin', None)
    res.pop('password_hash', None)
    return res

def save_settings(patch):
    conn = get_db()
    c = conn.cursor()

    # Intercept and securely hash admin pin if present in patch
    new_pin = patch.pop('admin_pin', None) or patch.pop('adminPin', None)
    if new_pin and str(new_pin).strip():
        set_admin_pin(str(new_pin).strip())

    for k, v in patch.items():
        if k in ('admin_pin', 'adminPin', 'password_hash'):
            continue
        if isinstance(v, (list, dict)):
            v = json.dumps(v)
        c.execute('INSERT OR REPLACE INTO settings (key, val) VALUES (?, ?)', (k, str(v)))
    bump_version('settings', conn)
    conn.commit()
    conn.close()
    return get_settings()

# --- Categories ---
def get_categories():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

def get_category(cat_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM categories WHERE id = ?', (cat_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_category(data):
    conn = get_db()
    c = conn.cursor()
    cat_id = str(data.get('id') or '').strip().lower()[:50]
    name = str(data.get('name') or '').strip()[:80]
    kh = str(data.get('kh') or name).strip()[:80]
    en = str(data.get('en') or name).strip()[:80]
    icon = str(data.get('icon') or '🛍️').strip()[:10]
    grad = str(data.get('grad') or 'linear-gradient(135deg,#d4af37,#8b5cf6)').strip()[:100]
    sort_order = max(0, min(999, int(data.get('sort_order', 0))))

    if cat_id:
        c.execute('SELECT id FROM categories WHERE id = ?', (cat_id,))
        exists = c.fetchone()
        if exists:
            c.execute('''
                UPDATE categories
                SET name = ?, kh = ?, en = ?, icon = ?, grad = ?, sort_order = ?
                WHERE id = ?
            ''', (name, kh, en, icon, grad, sort_order, cat_id))
        else:
            c.execute('''
                INSERT INTO categories (id, name, kh, en, icon, grad, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (cat_id, name, kh, en, icon, grad, sort_order, now()))
    else:
        # Generate slug or ID
        slug = ''.join(ch if ch.isalnum() else '-' for ch in name.lower()).strip('-')[:50]
        cat_id = slug if slug else 'cat-' + uuid.uuid4().hex[:6]
        c.execute('''
            INSERT INTO categories (id, name, kh, en, icon, grad, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (cat_id, name, kh, en, icon, grad, sort_order, now()))

    bump_version('categories', conn)
    conn.commit()
    conn.close()
    return get_category(cat_id)

def delete_category(cat_id):
    clean_id = str(cat_id or '').strip().lower()
    if not clean_id or clean_id == 'all':
        return False
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM categories WHERE id = ?', (clean_id,))
    c.execute('DELETE FROM category_filters WHERE category_id = ?', (clean_id,))
    bump_version('categories', conn)
    bump_version('category_filters', conn)
    conn.commit()
    conn.close()
    return True

# --- Category Filters (Dynamic Sub-category & Tag Filters per Category) ---
def get_category_filters(category_id=None):
    conn = get_db()
    c = conn.cursor()
    if category_id and str(category_id).strip().lower() != 'all':
        c.execute('SELECT * FROM category_filters WHERE category_id = ? ORDER BY sort_order ASC, created_at ASC', (category_id,))
    else:
        c.execute('SELECT * FROM category_filters ORDER BY category_id ASC, sort_order ASC, created_at ASC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    for f in rows:
        try:
            f['product_ids'] = json.loads(f.get('product_ids') or '[]')
        except Exception:
            f['product_ids'] = []
    return rows

def get_category_filter(filter_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM category_filters WHERE id = ?', (filter_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    f = dict(row)
    try:
        f['product_ids'] = json.loads(f.get('product_ids') or '[]')
    except Exception:
        f['product_ids'] = []
    return f

def upsert_category_filter(data):
    conn = get_db()
    c = conn.cursor()
    raw_id = data.get('id')
    filter_id = str(raw_id).strip() if raw_id else ''
    category_id = str(data.get('category_id') or 'all').strip()
    name = str(data.get('name') or '').strip()[:80]
    name_km = str(data.get('name_km') or name).strip()[:80]
    match_keywords = str(data.get('match_keywords') or '').strip()
    product_ids = data.get('product_ids', [])
    if isinstance(product_ids, list):
        product_ids_json = json.dumps(product_ids)
    else:
        product_ids_json = str(product_ids or '[]')
    sort_order = max(0, min(999, int(data.get('sort_order', 0))))

    if not filter_id:
        slug = ''.join(ch if ch.isalnum() else '-' for ch in name.lower()).strip('-')[:30]
        filter_id = f"flt-{category_id}-{slug}" if slug else f"flt-{uuid.uuid4().hex[:8]}"

    c.execute('SELECT id FROM category_filters WHERE id = ?', (filter_id,))
    exists = c.fetchone()
    if exists:
        c.execute('''
            UPDATE category_filters
            SET category_id = ?, name = ?, name_km = ?, match_keywords = ?, product_ids = ?, sort_order = ?
            WHERE id = ?
        ''', (category_id, name, name_km, match_keywords, product_ids_json, sort_order, filter_id))
    else:
        c.execute('''
            INSERT INTO category_filters (id, category_id, name, name_km, match_keywords, product_ids, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (filter_id, category_id, name, name_km, match_keywords, product_ids_json, sort_order, now()))

    bump_version('category_filters', conn)
    conn.commit()
    conn.close()
    return get_category_filter(filter_id)

def delete_category_filter(filter_id):
    clean_id = str(filter_id or '').strip()
    if not clean_id:
        return False
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM category_filters WHERE id = ?', (clean_id,))
    bump_version('category_filters', conn)
    conn.commit()
    conn.close()
    return True

# --- Products ---
def get_products(include_inactive=False):
    conn = get_db()
    c = conn.cursor()
    if include_inactive:
        c.execute('SELECT * FROM products ORDER BY created_at DESC')
    else:
        c.execute('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    for p in rows:
        p['active'] = bool(p['active'])
        p['free_delivery'] = 1 if p.get('free_delivery') in (1, '1', True) else 0
        p['final_price'] = round(p['price'] * (1 - (p['discount'] or 0) / 100.0), 2)
    return rows

def get_product(prod_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM products WHERE id = ?', (prod_id,))
    row = c.fetchone()
    conn.close()
    if not row: return None
    p = dict(row)
    p['active'] = bool(p['active'])
    p['free_delivery'] = 1 if p.get('free_delivery') in (1, '1', True) else 0
    p['final_price'] = round(p['price'] * (1 - (p['discount'] or 0) / 100.0), 2)
    return p

def generate_unique_product_id(prefix="PRD"):
    """
    Generate an official, non-duplicate Product ID for products.
    Format: PRD-1001, PRD-1002, etc. Guaranteed unique across all existing products.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM products WHERE id LIKE ?", (f"{prefix}-%",))
    existing_ids = {r['id'].strip().upper() for r in c.fetchall() if r['id']}
    conn.close()

    max_num = 1000
    for pid in existing_ids:
        parts = pid.split('-')
        if len(parts) == 2 and parts[1].isdigit():
            val = int(parts[1])
            if val > max_num:
                max_num = val

    next_num = max_num + 1
    while f"{prefix}-{next_num}" in existing_ids:
        next_num += 1
    return f"{prefix}-{next_num}"

def upsert_product(data):
    conn = get_db()
    c = conn.cursor()
    raw_id = data.get('id')
    prod_id = str(raw_id).strip().upper() if raw_id else ''
    prev_id = str(data.get('prev_id') or data.get('original_id') or '').strip().upper()
    is_new = bool(data.get('is_new', False))

    name = data.get('name', '').strip()
    cat = data.get('cat', 'minifigure')
    price = float(data.get('price', 0))
    discount = max(0, min(100, float(data.get('discount', 0))))
    stock = max(0, int(data.get('stock', 0)))
    pt = max(0, int(data.get('pt', 1)))
    image = data.get('image')
    active = 1 if data.get('active', True) else 0
    bio = (data.get('bio') or data.get('description') or '').strip()
    free_delivery = 1 if (data.get('free_delivery') is True or data.get('free_delivery') in (1, '1', 'true', 'True')) else 0

    # Auto-generate unique ID if missing
    if not prod_id:
        prod_id = generate_unique_product_id()

    # Check for duplicate ID
    c.execute('SELECT id FROM products WHERE upper(id) = upper(?)', (prod_id,))
    existing_row = c.fetchone()

    if is_new and existing_row:
        conn.close()
        return None, f"Product ID '{prod_id}' already exists. Each product must have a unique non-duplicate ID."

    if existing_row and prev_id and prev_id != prod_id:
        conn.close()
        return None, f"Product ID '{prod_id}' is already in use by another product."

    if existing_row:
        c.execute('''
            UPDATE products
            SET name = ?, cat = ?, price = ?, discount = ?, stock = ?, pt = ?, image = coalesce(?, image), active = ?, bio = ?, free_delivery = ?
            WHERE upper(id) = upper(?)
        ''', (name, cat, price, discount, stock, pt, image, active, bio, free_delivery, prod_id))
    else:
        c.execute('''
            INSERT INTO products (id, name, cat, price, discount, stock, pt, image, active, bio, created_at, free_delivery)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (prod_id, name, cat, price, discount, stock, pt, image, active, bio, now(), free_delivery))

    bump_version('products', conn)
    conn.commit()
    conn.close()
    p = get_product(prod_id)
    return p, None

def adjust_stock(prod_id, delta):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT stock FROM products WHERE id = ?', (prod_id,))
    row = c.fetchone()
    if row:
        new_stock = max(0, row['stock'] + delta)
        c.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, prod_id))
        bump_version('products', conn)
        conn.commit()
    conn.close()
    return get_product(prod_id)

def delete_product(prod_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM products WHERE id = ?', (prod_id,))
    bump_version('products', conn)
    conn.commit()
    conn.close()
    return True

def clear_products():
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM products')
    bump_version('products', conn)
    conn.commit()
    conn.close()
    return True

def seed_sample_products():
    samples = [
        {
            'id': 'PRD-2001',
            'name': 'Space Explorer Astronaut Mini Figurine',
            'cat': 'minifigure',
            'price': 8.5,
            'discount': 0,
            'stock': 25,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
            'bio': 'Collector-grade astronaut mini figure featuring articulated reflective gold visor helmet, life-support pack, and flag beacon. Precision-molded ABS resin with UV-resistant finish.',
            'active': True
        },
        {
            'id': 'PRD-2002',
            'name': 'Shadow Assassin Ninja Collectible Figure',
            'cat': 'minifigure',
            'price': 7.5,
            'discount': 0,
            'stock': 20,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80',
            'bio': 'Stealth combat ninja mini figurine with dual katana blades, throwing stars, and posable martial arts posture stand.',
            'active': True
        },
        {
            'id': 'PRD-2003',
            'name': 'Cyber Mecha Warrior Articulated Mini Figure',
            'cat': 'minifigure',
            'price': 12.0,
            'discount': 10,
            'stock': 15,
            'pt': 3,
            'image': 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
            'bio': 'Futuristic heavy mech infantry warrior with dual-shoulder energy cannons and detachable riot shield.',
            'active': True
        },
        {
            'id': 'PRD-2004',
            'name': 'Arcane Grand Wizard Figurine Display',
            'cat': 'minifigure',
            'price': 9.5,
            'discount': 0,
            'stock': 18,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=600&q=80',
            'bio': 'Mystical spellcaster figurine with translucent crystalline staff, ethereal robes, and spell effect stand.',
            'active': True
        },
        {
            'id': 'PRD-2005',
            'name': 'Solar System Kinetic Desk Orbit Toy',
            'cat': 'toy-universe',
            'price': 22.0,
            'discount': 5,
            'stock': 14,
            'pt': 4,
            'image': 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80',
            'bio': 'Mesmerizing perpetual kinetic solar orbit art piece. Precision-balanced counterweights keep concentric planetary rings spinning with soft ambient illumination.',
            'active': True
        },
        {
            'id': 'PRD-2006',
            'name': 'Titanium High-Velocity Gyroscope Spinner',
            'cat': 'toy-universe',
            'price': 12.0,
            'discount': 0,
            'stock': 30,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=600&q=80',
            'bio': 'Precision CNC-machined Grade 5 aerospace titanium gyroscope spinner with hybrid ceramic ball bearings for 6+ minutes spin time.',
            'active': True
        },
        {
            'id': 'PRD-2007',
            'name': 'Galaxy Orbital Space Shuttle Set',
            'cat': 'toy-universe',
            'price': 18.5,
            'discount': 5,
            'stock': 16,
            'pt': 3,
            'image': 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=600&q=80',
            'bio': 'Multi-stage kinetic space exploration set featuring booster rocket assembly, payload cargo bay with opening doors, and mini satellite module.',
            'active': True
        },
        {
            'id': 'PRD-2008',
            'name': 'Turbo Speed Racer Track Machine',
            'cat': 'toy-universe',
            'price': 14.0,
            'discount': 0,
            'stock': 22,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?auto=format&fit=crop&w=600&q=80',
            'bio': 'Die-cast aerodynamic super racing machine with frictionless low-drag wheels and dynamic suspension chassis.',
            'active': True
        },
        {
            'id': 'PRD-2009',
            'name': 'Stainless Steel Cuban Link Silver Bracelet',
            'cat': 'bracelet',
            'price': 19.99,
            'discount': 10,
            'stock': 24,
            'pt': 3,
            'image': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80',
            'bio': 'Heavyweight 8mm Miami Cuban curb link bracelet forged from solid 316L surgical stainless steel. 100% tarnish-proof, waterproof, and hypoallergenic.',
            'active': True
        },
        {
            'id': 'PRD-2010',
            'name': '18K Gold Plated Cuban Chain Bracelet',
            'cat': 'bracelet',
            'price': 25.0,
            'discount': 10,
            'stock': 15,
            'pt': 4,
            'image': 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=600&q=80',
            'bio': 'Heavyweight 8mm Miami Cuban curb chain bracelet forged with solid 316L stainless steel and electroplated in radiant 18K yellow gold.',
            'active': True
        },
        {
            'id': 'PRD-2011',
            'name': 'Matte Black Natural Obsidian Beaded Bracelet',
            'cat': 'bracelet',
            'price': 15.0,
            'discount': 0,
            'stock': 35,
            'pt': 2,
            'image': 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=600&q=80',
            'bio': 'Genuine 8mm volcanic obsidian stone beads threaded on heavy-duty elastic band with brushed gunmetal spacer beads.',
            'active': True
        },
        {
            'id': 'PRD-2012',
            'name': 'Rose Gold Magnetic Couple Bracelet Pair',
            'cat': 'bracelet',
            'price': 28.0,
            'discount': 10,
            'stock': 20,
            'pt': 4,
            'image': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=80',
            'bio': 'Romantic matching 2-piece bracelet set featuring complementary Rose Gold and Obsidian chains with half-heart magnetic charms.',
            'active': True
        },
        {
            'id': 'PRD-2013',
            'name': 'Sterling Silver Minimalist Unisex Bangle',
            'cat': 'bracelet',
            'price': 22.0,
            'discount': 0,
            'stock': 18,
            'pt': 3,
            'image': 'https://images.unsplash.com/photo-1600003014755-ba31aa59c4b6?auto=format&fit=crop&w=600&q=80',
            'bio': 'Sleek open-cuff minimalist bangle handcrafted from 925 sterling silver with comfort-bevel rounded edges.',
            'active': True
        },
        {
            'id': 'PRD-2014',
            'name': 'Angkor Soul Heritage Golden Figurine',
            'cat': 'minifigure',
            'price': 9.99,
            'discount': 0,
            'stock': 20,
            'pt': 3,
            'image': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
            'bio': 'Exclusive Somphea Reak Cambodia Kingdom of Wonder collector edition mini figurine with ceremonial Khmer gold motif.',
            'active': True
        },
        {
            'id': 'PRD-2015',
            'name': 'Custom Italy Modular Charm Starter Bracelet',
            'cat': 'bracelet',
            'price': 18.0,
            'discount': 0,
            'stock': 30,
            'pt': 4,
            'image': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80',
            'bio': 'Handcrafted authentic 9mm surgical stainless steel starter charm bracelet base with 18 interchangeable spring-loaded modular links.',
            'active': True
        }
    ]
    clear_products()
    for s in samples:
        upsert_product(s)
    return get_products(True)

# --- Users ---
def get_users():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users ORDER BY created_at DESC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    for u in rows:
        u['vouchers'] = json.loads(u.get('vouchers') or '[]')
        u['point_log'] = json.loads(u.get('point_log') or '[]')
    return rows

def get_user(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    conn.close()
    if not row: return None
    u = dict(row)
    u['vouchers'] = json.loads(u.get('vouchers') or '[]')
    u['point_log'] = json.loads(u.get('point_log') or '[]')
    return u

def upsert_user(username, phone):
    conn = get_db()
    c = conn.cursor()
    uname = username.strip().lstrip('@')
    c.execute('SELECT * FROM users WHERE lower(username) = lower(?)', (uname,))
    row = c.fetchone()

    if row:
        u_id = row['id']
        c.execute('UPDATE users SET phone = ? WHERE id = ?', (phone, u_id))
    else:
        u_id = 'U' + uuid.uuid4().hex[:8]
        c.execute('''
            INSERT INTO users (id, username, phone, name, points, vouchers, point_log, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (u_id, uname, phone, '', 0, '[]', '[]', now()))

    bump_version('users', conn)
    conn.commit()

    c.execute('SELECT * FROM users WHERE id = ?', (u_id,))
    res_row = c.fetchone()
    conn.close()

    if not res_row:
        return None
    u = dict(res_row)
    u['vouchers'] = json.loads(u.get('vouchers') or '[]')
    u['point_log'] = json.loads(u.get('point_log') or '[]')
    u.pop('password_hash', None)
    return u

def register_customer(username, phone, password):
    conn = get_db()
    c = conn.cursor()
    uname = username.strip().lstrip('@')
    clean_phone = phone.strip()
    if not uname:
        conn.close()
        return None, 'Telegram username is required'
    if not password or len(password) < 4:
        conn.close()
        return None, 'Password must be at least 4 characters'

    c.execute('SELECT * FROM users WHERE lower(username) = lower(?)', (uname,))
    existing_user = c.fetchone()
    if existing_user:
        if existing_user['password_hash']:
            conn.close()
            return None, 'An account with this Telegram username already exists. Please log in.'
        u_id = existing_user['id']
        pw_hash = generate_password_hash(password)
        c.execute('UPDATE users SET phone = ?, password_hash = ? WHERE id = ?', (clean_phone, pw_hash, u_id))
    else:
        if clean_phone:
            c.execute('SELECT * FROM users WHERE phone = ? AND password_hash IS NOT NULL', (clean_phone,))
            if c.fetchone():
                conn.close()
                return None, 'An account with this phone number already exists. Please log in.'

        u_id = 'U' + uuid.uuid4().hex[:8]
        pw_hash = generate_password_hash(password)
        welcome_log = json.dumps([{'t': 'Welcome VIP Bonus', 'd': 10, 'at': now()}])
        c.execute('''
            INSERT INTO users (id, username, phone, name, password_hash, points, vouchers, point_log, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (u_id, uname, clean_phone, uname, pw_hash, 10, '[]', welcome_log, now()))

    bump_version('users', conn)
    conn.commit()

    c.execute('SELECT * FROM users WHERE id = ?', (u_id,))
    res_row = c.fetchone()
    conn.close()

    if not res_row:
        return None, 'Registration failed'
    u = dict(res_row)
    u['vouchers'] = json.loads(u.get('vouchers') or '[]')
    u['point_log'] = json.loads(u.get('point_log') or '[]')
    u.pop('password_hash', None)
    return u, None

def login_customer(identifier, password):
    conn = get_db()
    c = conn.cursor()
    ident = (identifier or '').strip()
    clean_ident = ident.lstrip('@')
    digits_ident = ''.join(ch for ch in ident if ch.isdigit())

    c.execute('''
        SELECT * FROM users
        WHERE lower(username) = lower(?)
           OR phone = ?
           OR (length(?) >= 6 AND replace(replace(replace(phone, ' ', ''), '-', ''), '+855', '0') LIKE ?)
    ''', (clean_ident, ident, digits_ident, f'%{digits_ident[-8:]}%' if len(digits_ident) >= 8 else '%invalid%'))
    row = c.fetchone()

    if not row:
        conn.close()
        return None, 'Account not found with this phone number or Telegram username'

    u = dict(row)
    stored_hash = u.get('password_hash')

    if stored_hash:
        if not password or not check_password_hash(stored_hash, password):
            conn.close()
            return None, 'Incorrect password. Please try again or use Recover Account.'
    else:
        if password and len(password) >= 4:
            new_hash = generate_password_hash(password)
            c.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, u['id']))
            conn.commit()

    conn.close()
    u['vouchers'] = json.loads(u.get('vouchers') or '[]')
    u['point_log'] = json.loads(u.get('point_log') or '[]')
    u.pop('password_hash', None)
    return u, None

def recover_customer_password(identifier, new_password):
    conn = get_db()
    c = conn.cursor()
    ident = (identifier or '').strip()
    clean_ident = ident.lstrip('@')
    digits_ident = ''.join(ch for ch in ident if ch.isdigit())

    if not new_password or len(new_password) < 4:
        conn.close()
        return None, 'New password must be at least 4 characters'

    c.execute('''
        SELECT * FROM users
        WHERE lower(username) = lower(?)
           OR phone = ?
           OR (length(?) >= 6 AND replace(replace(replace(phone, ' ', ''), '-', ''), '+855', '0') LIKE ?)
    ''', (clean_ident, ident, digits_ident, f'%{digits_ident[-8:]}%' if len(digits_ident) >= 8 else '%invalid%'))
    row = c.fetchone()

    if not row:
        conn.close()
        return None, 'Account not found with this phone number or Telegram handle'

    u_id = row['id']
    new_hash = generate_password_hash(new_password)
    c.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, u_id))
    bump_version('users', conn)
    conn.commit()

    c.execute('SELECT * FROM users WHERE id = ?', (u_id,))
    res_row = c.fetchone()
    conn.close()

    if not res_row:
        return None, 'Password recovery failed'
    u = dict(res_row)
    u['vouchers'] = json.loads(u.get('vouchers') or '[]')
    u['point_log'] = json.loads(u.get('point_log') or '[]')
    u.pop('password_hash', None)
    return u, None

def update_user(user_id, data):
    conn = get_db()
    c = conn.cursor()
    fields = []
    vals = []
    if 'name' in data:
        fields.append('name = ?'); vals.append(data['name'])
    if 'phone' in data:
        fields.append('phone = ?'); vals.append(data['phone'])
    if 'points' in data:
        fields.append('points = ?'); vals.append(int(data['points']))
    if 'vouchers' in data:
        fields.append('vouchers = ?'); vals.append(json.dumps(data['vouchers']))
    if 'point_log' in data:
        fields.append('point_log = ?'); vals.append(json.dumps(data['point_log']))

    if fields:
        vals.append(user_id)
        c.execute(f'UPDATE users SET {", ".join(fields)} WHERE id = ?', vals)
        bump_version('users', conn)
        conn.commit()
    conn.close()
    return get_user(user_id)

def add_user_points(user_id, delta, reason):
    u = get_user(user_id)
    if not u: return None
    new_points = max(0, u['points'] + delta)
    log = u.get('point_log', [])
    log.insert(0, {'t': reason, 'd': delta, 'at': now()})
    return update_user(user_id, {'points': new_points, 'point_log': log})

def redeem_voucher(user_id):
    u = get_user(user_id)
    if not u: return None, 'User not found'
    st = get_settings()
    vc = st.get('voucher_cost', 25)
    vp = st.get('voucher_pct', 10)
    if u['points'] < vc:
        return None, f'Insufficient points (need {vc} pt)'

    code = f'SR{vp}-' + uuid.uuid4().hex[:5].upper()
    vouchers = u.get('vouchers', [])
    v_obj = {'code': code, 'pct': vp, 'used': False, 'created_at': now()}
    vouchers.insert(0, v_obj)

    new_points = u['points'] - vc
    log = u.get('point_log', [])
    log.insert(0, {'t': f'Redeemed voucher {code}', 'd': -vc, 'at': now()})

    update_user(user_id, {'points': new_points, 'vouchers': vouchers, 'point_log': log})
    return v_obj, None

# --- Orders ---
def _enrich_order_dict(o):
    if not o:
        return o
    items_raw = o.get('items')
    if isinstance(items_raw, str):
        try:
            o['items'] = json.loads(items_raw)
        except Exception:
            o['items'] = []
    elif isinstance(items_raw, list):
        o['items'] = items_raw
    else:
        o['items'] = []

    contact_raw = o.get('contact') or '{}'
    if isinstance(contact_raw, str):
        try:
            o['contact'] = json.loads(contact_raw)
        except Exception:
            o['contact'] = {'address': contact_raw}
    elif isinstance(contact_raw, dict):
        o['contact'] = contact_raw
    else:
        o['contact'] = {}

    contact = o['contact']
    u = None
    try:
        u = get_user(o.get('user_id'))
    except Exception:
        pass
    u_username = (u.get('username') if u else '') or ''
    u_phone = (u.get('phone') if u else '') or ''

    # Guarantee official receipt number formatted as xxxx-xx-xx Txx.xx (e.g. 2026-10-12 T22.15)
    raw_id = o.get('id', '')
    created_at = o.get('created_at', '')
    receipt_num = raw_id
    if created_at:
        import re
        m = re.search(r'(\d{4}-\d{2}-\d{2})[T\s](\d{2})[:\.](\d{2})', str(created_at))
        if m:
            receipt_num = f"{m.group(1)} T{m.group(2)}.{m.group(3)}"
    o['receipt_number'] = receipt_num
    o['customer_name'] = contact.get('name') or contact.get('customer_name') or u_username or 'Customer'
    o['phone'] = contact.get('phone') or u_phone or 'N/A'
    raw_tg = contact.get('telegram') or contact.get('telegram_username') or u_username or ''
    o['telegram_username'] = str(raw_tg).strip().replace('@', '')
    o['address'] = contact.get('address') or 'Phnom Penh'
    o['notes'] = contact.get('notes') or o.get('note') or ''
    o['payment_method'] = contact.get('payment') or o.get('payment') or 'ABA KHQR (Scan to Pay)'
    o['payment'] = o['payment_method']
    o['payment_type'] = contact.get('payment_type') or ('COD' if 'COD' in str(o['payment']).upper() else 'KHQR')

    raw_v = o.get('voucher') or contact.get('voucher') or contact.get('voucher_code') or ''
    voucher_val = str(raw_v).strip() if raw_v else ''
    if voucher_val.lower() in ('null', 'none', 'undefined', 'false', '0'):
        voucher_val = ''
    o['voucher'] = voucher_val
    o['voucher_code'] = voucher_val
    o['discount'] = float(o.get('discount') if o.get('discount') is not None else contact.get('discount', 0.0))
    sub_val = float(o.get('subtotal') if o.get('subtotal') is not None else contact.get('subtotal', 0.0))
    o['subtotal'] = sub_val
    v_pct = float(o.get('voucher_pct') if o.get('voucher_pct') is not None else contact.get('voucher_pct', 0.0))
    if v_pct <= 0 and o['discount'] > 0 and sub_val > 0:
        v_pct = round((o['discount'] / sub_val) * 100)
    o['voucher_pct'] = v_pct

    return o

def get_orders(user_id=None):
    if not user_id:
        try:
            run_auto_wipe_orders()
        except Exception:
            pass
    conn = get_db()
    c = conn.cursor()
    if user_id:
        query_val = str(user_id).strip()
        clean_val = query_val.lstrip('@')
        digits_val = ''.join(ch for ch in query_val if ch.isdigit())

        # Resolve user details if present
        u = None
        c.execute('''
            SELECT * FROM users
            WHERE id = ?
               OR lower(username) = lower(?)
               OR phone = ?
               OR (length(?) >= 6 AND replace(replace(replace(phone, ' ', ''), '-', ''), '+855', '0') LIKE ?)
            LIMIT 1
        ''', (query_val, clean_val, query_val, digits_val, f'%{digits_val[-8:]}%' if len(digits_val) >= 8 else '%__nomatch__%'))
        row = c.fetchone()
        if row:
            u = dict(row)

        possible_ids = {query_val, clean_val}
        if u:
            if u.get('id'): possible_ids.add(u['id'])
            if u.get('username'): possible_ids.add(u['username'])
            if u.get('phone'): possible_ids.add(u['phone'])

        id_placeholders = ','.join(['?'] * len(possible_ids))
        sql = f'''
            SELECT * FROM orders
            WHERE user_id IN ({id_placeholders})
               OR id = ?
               OR contact LIKE ?
               OR contact LIKE ?
            ORDER BY created_at DESC
        '''
        params = list(possible_ids) + [
            query_val,
            f'%{clean_val}%' if len(clean_val) >= 3 else '%__nomatch__%',
            f'%{digits_val[-8:]}%' if len(digits_val) >= 8 else '%__nomatch__%'
        ]
        c.execute(sql, params)
    else:
        c.execute('SELECT * FROM orders ORDER BY created_at DESC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    result = []
    for o in rows:
        try:
            result.append(_enrich_order_dict(o))
        except Exception:
            o['items'] = []
            o['receipt_number'] = o.get('id', '')
            result.append(o)
    return result

def get_order(order_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
    row = c.fetchone()
    conn.close()
    if not row: return None
    return _enrich_order_dict(dict(row))

def place_order(order_data):
    conn = get_db()
    c = conn.cursor()
    
    # Auto-generate professional Customer Order Receipt Number (e.g. SR-261010-8492)
    order_id = str(order_data.get('id') or order_data.get('order_id') or order_data.get('receipt_number') or '').strip()
    if not order_id or not order_id.startswith('SR-'):
        order_id = 'SR-' + datetime.now().strftime('%y%m%d') + '-' + uuid.uuid4().hex[:4].upper()
    
    user_id = order_data.get('user_id') or 'guest_user'
    items = json.dumps(order_data.get('items', []))
    subtotal = float(order_data.get('subtotal', 0))
    discount = float(order_data.get('discount', 0))
    delivery = float(order_data.get('delivery', 0))
    total = float(order_data.get('total', subtotal - discount + delivery))
    earned = int(order_data.get('earned', 0))
    raw_v = str(order_data.get('voucher') or order_data.get('voucher_code') or '').strip()
    voucher = raw_v if raw_v.lower() not in ('null', 'none', 'undefined', 'false', '0') else ''
    voucher_pct = float(order_data.get('voucher_pct', 0))
    if voucher_pct <= 0 and discount > 0 and subtotal > 0:
        voucher_pct = round((discount / subtotal) * 100)
    status = 'Pending'
    
    contact_data = order_data.get('contact', {})
    if isinstance(contact_data, str):
        try:
            contact_data = json.loads(contact_data)
        except Exception:
            contact_data = {'address': contact_data}
    elif not isinstance(contact_data, dict):
        contact_data = {}

    cust_name = str(order_data.get('customer_name') or order_data.get('name') or contact_data.get('name') or '').strip()
    cust_phone = str(order_data.get('phone') or contact_data.get('phone') or '').strip()
    cust_telegram = str(order_data.get('telegram_username') or order_data.get('telegram') or contact_data.get('telegram') or '').strip().replace('@', '')
    cust_address = str(order_data.get('address') or contact_data.get('address') or '').strip()
    cust_notes = str(order_data.get('notes') or order_data.get('note') or contact_data.get('notes') or '').strip()

    if cust_name: contact_data['name'] = cust_name
    if cust_phone: contact_data['phone'] = cust_phone
    if cust_telegram: contact_data['telegram'] = cust_telegram
    if cust_address: contact_data['address'] = cust_address
    if cust_notes: contact_data['notes'] = cust_notes
    contact_data['receipt_number'] = order_id
    if voucher:
        contact_data['voucher'] = voucher
        contact_data['voucher_code'] = voucher
        contact_data['discount'] = discount
        contact_data['voucher_pct'] = voucher_pct
        contact_data['subtotal'] = subtotal
        contact_data['total'] = total

    payment = order_data.get('payment_method') or order_data.get('payment') or contact_data.get('payment') or 'ABA KHQR (Scan to Pay)'
    contact_data['payment'] = payment
    contact_data['payment_type'] = 'COD' if 'COD' in str(payment).upper() else 'KHQR'
    contact = json.dumps(contact_data)
    created_at = now()

    c.execute('''
        INSERT INTO orders (id, user_id, items, subtotal, discount, delivery, total, earned, voucher, status, contact, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (order_id, user_id, items, subtotal, discount, delivery, total, earned, voucher, status, contact, created_at))

    # Mark the voucher as used in user's profile in SQLite so it never disappears or reverts
    if voucher:
        c.execute('SELECT vouchers FROM users WHERE id = ?', (user_id,))
        urow = c.fetchone()
        if urow:
            v_list = json.loads(urow['vouchers'] or '[]')
            v_matched = False
            for v_item in v_list:
                if v_item.get('code') == voucher:
                    v_item['used'] = True
                    v_item['used_at'] = created_at
                    v_item['order_id'] = order_id
                    v_matched = True
                    break
            if not v_matched:
                v_list.append({
                    'code': voucher,
                    'pct': int(voucher_pct or 10),
                    'used': True,
                    'used_at': created_at,
                    'order_id': order_id
                })
            c.execute('UPDATE users SET vouchers = ? WHERE id = ?', (json.dumps(v_list), user_id))

    # Create notification for admin
    u = get_user(user_id)
    uname = u['username'] if u else 'customer'
    notif_id = 'N' + uuid.uuid4().hex[:8]
    voucher_tag = f" (🎟️ Voucher: {voucher} -${discount:.2f})" if voucher and discount > 0 else ""
    c.execute('''
        INSERT INTO notifications (id, type, order_id, user_id, text, read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    ''', (notif_id, 'receipt', order_id, user_id, f'New receipt #{order_id} from @{uname} • ${total:.2f}{voucher_tag}', created_at))

    bump_version('orders', conn)
    bump_version('notifications', conn)
    if voucher:
        bump_version('users', conn)

    conn.commit()
    conn.close()
    return get_order(order_id)

def approve_order(order_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None, 'Order not found'
    if row['status'] != 'Pending':
        conn.close()
        return None, f'Order is already {row["status"]}'

    items = json.loads(row['items'] or '[]')

    # Collect stock requirements for products & charms
    product_deductions = []  # list of (product_row, qty_needed)
    charm_needs = {}        # charm_key -> total_qty_needed

    for it in items:
        if not isinstance(it, dict):
            continue
        qty = max(1, int(it.get('qty', 1)))
        is_custom = it.get('isCustom')
        pid = it.get('productId') or it.get('product_id') or it.get('id')
        name = it.get('name', '')

        # 1. Product check
        if not is_custom or pid:
            c.execute('SELECT id, name, stock FROM products WHERE id = ? OR name = ?', (pid or '', name or ''))
            p = c.fetchone()
            if p:
                if p['stock'] < qty:
                    conn.close()
                    return None, f'Insufficient stock for "{p["name"]}" ({p["stock"]} remaining, need {qty})'
                product_deductions.append((dict(p), qty))

        # 2. Custom bracelet charms check
        links = it.get('braceletLinks') or it.get('links') or []
        if links:
            for link in links:
                if not isinstance(link, dict):
                    continue
                if link.get('isPlain'):
                    continue
                lname = str(link.get('name', '')).lower()
                if 'plain stainless' in lname or 'starter' in lname:
                    continue
                cid = link.get('id') or link.get('name') or link.get('model_no')
                if cid:
                    charm_needs[cid] = charm_needs.get(cid, 0) + (1 * qty)

    # Verify charm stocks
    charm_deductions = []  # list of (charm_row, total_qty_needed)
    for ckey, needed in charm_needs.items():
        c.execute('SELECT id, name, stock FROM charms WHERE id = ? OR name = ? OR model_no = ?', (ckey, ckey, ckey))
        ch = c.fetchone()
        if ch:
            if ch['stock'] < needed:
                conn.close()
                return None, f'Insufficient stock for charm "{ch["name"]}" ({ch["stock"]} remaining, need {needed})'
            charm_deductions.append((dict(ch), needed))

    # Apply product stock deductions
    for prod_info, qty in product_deductions:
        c.execute('UPDATE products SET stock = max(0, stock - ?) WHERE id = ?', (qty, prod_info['id']))

    # Apply charm stock deductions
    for ch_info, needed in charm_deductions:
        c.execute('UPDATE charms SET stock = max(0, stock - ?) WHERE id = ?', (needed, ch_info['id']))

    decided_at = now()
    already_awarded = False
    try:
        already_awarded = bool(row['points_awarded'])
    except Exception:
        pass

    c.execute('UPDATE orders SET status = "Approved", decided_at = ?, points_awarded = 1 WHERE id = ?', (decided_at, order_id))

    # Calculate earned points (with robust fallback)
    earned = int(row['earned'] or 0)
    if earned <= 0:
        calc_pts = 0
        for it in items:
            if isinstance(it, dict):
                pt = max(1, int(it.get('points') or it.get('pt') or 1))
                q = max(1, int(it.get('qty', 1)))
                calc_pts += pt * q
        earned = max(1, min(calc_pts, 500))

    # User lookup & points award (only if not already awarded!)
    user_id = row['user_id']
    u = None
    if not already_awarded:
        if user_id and user_id != 'guest_user':
            c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            u = c.fetchone()
            if not u:
                c.execute('SELECT * FROM users WHERE lower(username) = lower(?)', (user_id.lstrip('@'),))
                u = c.fetchone()

        if not u:
            contact_data = {}
            raw_contact = row['contact']
            if isinstance(raw_contact, str):
                try:
                    contact_data = json.loads(raw_contact)
                except Exception:
                    pass
            elif isinstance(raw_contact, dict):
                contact_data = raw_contact

            cand_tg = (contact_data.get('telegram') or contact_data.get('telegram_username') or '').strip().lstrip('@')
            cand_phone = (contact_data.get('phone') or '').strip()
            cand_name = (contact_data.get('name') or contact_data.get('customer_name') or '').strip().lstrip('@')

            if cand_tg:
                c.execute('SELECT * FROM users WHERE lower(username) = lower(?)', (cand_tg,))
                u = c.fetchone()
            if not u and cand_phone:
                c.execute('SELECT * FROM users WHERE phone = ?', (cand_phone,))
                u = c.fetchone()
            if not u and cand_name:
                c.execute('SELECT * FROM users WHERE lower(username) = lower(?)', (cand_name,))
                u = c.fetchone()

            # If user record still doesn't exist, create it so the buyer receives their points!
            if not u:
                uname = cand_tg or cand_name or f'user_{uuid.uuid4().hex[:6]}'
                new_uid = 'U' + uuid.uuid4().hex[:8]
                c.execute('''
                    INSERT INTO users (id, username, phone, name, points, vouchers, point_log, created_at)
                    VALUES (?, ?, ?, ?, 0, '[]', '[]', ?)
                ''', (new_uid, uname, cand_phone, cand_name or uname, now()))
                c.execute('SELECT * FROM users WHERE id = ?', (new_uid,))
                u = c.fetchone()
                c.execute('UPDATE orders SET user_id = ? WHERE id = ?', (new_uid, order_id))

        if u:
            target_uid = u['id']
            new_pts = int(u['points'] or 0) + earned
            log = json.loads(u['point_log'] or '[]')
            log.insert(0, {
                't': f'Order #{order_id} approved by admin (+{earned} pt)',
                'd': earned,
                'at': decided_at,
                'order_id': order_id,
                'balance': new_pts
            })
            c.execute('UPDATE users SET points = ?, point_log = ? WHERE id = ?', (new_pts, json.dumps(log), target_uid))

    # Notify customer
    notif_id = 'N' + uuid.uuid4().hex[:8]
    notify_uid = u['id'] if u else user_id
    c.execute('''
        INSERT INTO notifications (id, type, order_id, user_id, text, read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    ''', (notif_id, 'order_approved', order_id, notify_uid, f'Order #{order_id} was approved! +{earned} pt added to your balance.', decided_at))

    bump_version('orders', conn)
    bump_version('products', conn)
    bump_version('charms', conn)
    bump_version('users', conn)
    bump_version('notifications', conn)

    conn.commit()
    conn.close()
    return get_order(order_id), None

def reject_order(order_id, note='Out of stock'):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
    row = c.fetchone()
    if not row or row['status'] != 'Pending':
        conn.close()
        return None, 'Order not in pending status'

    decided_at = now()
    c.execute('UPDATE orders SET status = "Rejected", note = ?, decided_at = ?, points_awarded = 0 WHERE id = ?', (note, decided_at, order_id))

    # Refund voucher if applied
    voucher_code = row['voucher']
    user_id = row['user_id']
    if voucher_code:
        c.execute('SELECT vouchers FROM users WHERE id = ?', (user_id,))
        u = c.fetchone()
        if u:
            vouchers = json.loads(u['vouchers'] or '[]')
            for v in vouchers:
                if v.get('code') == voucher_code:
                    v['used'] = False
            c.execute('UPDATE users SET vouchers = ? WHERE id = ?', (json.dumps(vouchers), user_id))

    # Customer notification
    notif_id = 'N' + uuid.uuid4().hex[:8]
    c.execute('''
        INSERT INTO notifications (id, type, order_id, user_id, text, read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    ''', (notif_id, 'order_rejected', order_id, user_id, f'Order #{order_id} was declined: {note}. Voucher refunded.', decided_at))

    bump_version('orders', conn)
    bump_version('notifications', conn)
    if voucher_code:
        bump_version('users', conn)

    conn.commit()
    conn.close()
    return get_order(order_id), None

def cancel_order(order_id, reason='Cancelled by admin'):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None, 'Order not found'

    old_status = row['status']
    decided_at = now()

    # If already approved, restore stock & revert points
    if old_status in ('Approved', 'Shipped'):
        items = json.loads(row['items'] or '[]')
        for it in items:
            if not isinstance(it, dict):
                continue
            qty = max(1, int(it.get('qty', 1)))
            pid = it.get('productId') or it.get('product_id') or it.get('id')
            name = it.get('name', '')
            if pid or name:
                c.execute('UPDATE products SET stock = stock + ? WHERE id = ? OR name = ?', (qty, pid or '', name or ''))

            links = it.get('braceletLinks') or it.get('links') or []
            if links:
                for link in links:
                    if isinstance(link, dict) and not link.get('isPlain'):
                        cid = link.get('id') or link.get('name') or link.get('model_no')
                        if cid:
                            c.execute('UPDATE charms SET stock = stock + ? WHERE id = ? OR name = ? OR model_no = ?', (1 * qty, cid, cid, cid))

        user_id = row['user_id']
        earned = int(row['earned'] or 0)
        c.execute('SELECT points, point_log FROM users WHERE id = ?', (user_id,))
        u = c.fetchone()
        if u and earned > 0:
            new_pts = max(0, int(u['points'] or 0) - earned)
            log = json.loads(u['point_log'] or '[]')
            log.insert(0, {'t': f'Order #{order_id} cancelled (stock refunded)', 'd': -earned, 'at': decided_at})
            c.execute('UPDATE users SET points = ?, point_log = ? WHERE id = ?', (new_pts, json.dumps(log), user_id))

    voucher_code = row['voucher']
    user_id = row['user_id']
    if voucher_code:
        c.execute('SELECT vouchers FROM users WHERE id = ?', (user_id,))
        u = c.fetchone()
        if u:
            vouchers = json.loads(u['vouchers'] or '[]')
            for v in vouchers:
                if v.get('code') == voucher_code:
                    v['used'] = False
            c.execute('UPDATE users SET vouchers = ? WHERE id = ?', (json.dumps(vouchers), user_id))

    c.execute('UPDATE orders SET status = "Cancelled", note = ?, decided_at = ?, points_awarded = 0 WHERE id = ?', (reason, decided_at, order_id))
    bump_version('orders', conn)
    bump_version('products', conn)
    bump_version('charms', conn)
    bump_version('users', conn)
    bump_version('notifications', conn)
    conn.commit()
    conn.close()
    return get_order(order_id), None

def set_order_status(order_id, status):
    if str(status).lower() in ('approved', 'confirmed'):
        ord_obj, _ = approve_order(order_id)
        if ord_obj:
            return ord_obj
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE orders SET status = ? WHERE id = ?', (status, order_id))
    bump_version('orders', conn)
    conn.commit()
    conn.close()
    return get_order(order_id)

def update_order(order_id, update_data):
    """
    Allow admin to edit receipt and order information after customer places an order.
    Updates customer name, phone, address, telegram_username, payment method, payment status,
    order status, delivery fee, discount, subtotal, total, items, notes.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None, f"Order #{order_id} not found"

    current = dict(row)
    contact_raw = current.get('contact') or '{}'
    if isinstance(contact_raw, str):
        try:
            contact = json.loads(contact_raw)
        except Exception:
            contact = {'address': contact_raw}
    else:
        contact = dict(contact_raw)

    # Support nested customer dictionary if passed
    cust = update_data.get('customer')
    if isinstance(cust, dict):
        if 'name' in cust:
            contact['name'] = str(cust['name']).strip()
            contact['customer_name'] = contact['name']
        if 'phone' in cust:
            contact['phone'] = str(cust['phone']).strip()
        if 'address' in cust:
            contact['address'] = str(cust['address']).strip()
        if 'telegram' in cust:
            tg = str(cust['telegram']).strip().lstrip('@')
            contact['telegram'] = tg
            contact['telegram_username'] = tg
        if 'telegram_username' in cust:
            tg = str(cust['telegram_username']).strip().lstrip('@')
            contact['telegram'] = tg
            contact['telegram_username'] = tg

    # Update contact fields
    if 'customer_name' in update_data:
        contact['name'] = str(update_data['customer_name']).strip()
        contact['customer_name'] = contact['name']
    if 'name' in update_data:
        contact['name'] = str(update_data['name']).strip()
        contact['customer_name'] = contact['name']
    if 'phone' in update_data:
        contact['phone'] = str(update_data['phone']).strip()
    if 'address' in update_data:
        contact['address'] = str(update_data['address']).strip()
    if 'telegram_username' in update_data:
        tg = str(update_data['telegram_username']).strip().lstrip('@')
        contact['telegram'] = tg
        contact['telegram_username'] = tg
    if 'telegram' in update_data:
        tg = str(update_data['telegram']).strip().lstrip('@')
        contact['telegram'] = tg
        contact['telegram_username'] = tg
    if 'payment_method' in update_data:
        contact['payment'] = str(update_data['payment_method']).strip()
        contact['payment_method'] = contact['payment']
    if 'payment' in update_data:
        contact['payment'] = str(update_data['payment']).strip()
        contact['payment_method'] = contact['payment']
    if 'payment_type' in update_data:
        contact['payment_type'] = str(update_data['payment_type']).strip()
    if 'notes' in update_data:
        contact['notes'] = str(update_data['notes']).strip()
    elif 'note' in update_data:
        contact['notes'] = str(update_data['note']).strip()

    # Numeric fields
    subtotal = float(update_data.get('subtotal', current['subtotal']))
    discount = float(update_data.get('discount', current['discount']))
    delivery = float(update_data.get('delivery', update_data.get('delivery_fee', current['delivery'])))
    total = float(update_data.get('total', subtotal - discount + delivery))
    earned = int(update_data.get('earned', current.get('earned', 0)))
    status = str(update_data.get('status', current['status'])).strip()
    note = str(update_data.get('notes') if 'notes' in update_data else (update_data.get('note') or current.get('note') or '')).strip()
    voucher = str(update_data.get('voucher') if 'voucher' in update_data else (current.get('voucher') or '')).strip()
    if voucher.lower() in ('null', 'none', 'undefined', 'false', '0'):
        voucher = ''
    if voucher:
        contact['voucher'] = voucher
        contact['voucher_code'] = voucher
        contact['discount'] = discount

    # Items
    items_json = current['items']
    if 'items' in update_data:
        items_data = update_data['items']
        if isinstance(items_data, str):
            items_json = items_data
        else:
            items_json = json.dumps(items_data)

    contact_json = json.dumps(contact)

    # Track points awarding when admin changes status
    points_awarded = int(current.get('points_awarded') or 0)
    user_id = current.get('user_id')
    decided_at = now()

    if status.lower() in ('approved', 'confirmed') and points_awarded == 0:
        # Credit loyalty points to customer account
        if user_id and user_id != 'guest_user':
            c.execute('SELECT points, point_log FROM users WHERE id = ?', (user_id,))
            u = c.fetchone()
            if u:
                new_pts = int(u['points'] or 0) + earned
                log = json.loads(u['point_log'] or '[]')
                log.insert(0, {
                    't': f'Order #{order_id} confirmed by admin (+{earned} pt)',
                    'd': earned,
                    'at': decided_at,
                    'order_id': order_id,
                    'balance': new_pts
                })
                c.execute('UPDATE users SET points = ?, point_log = ? WHERE id = ?', (new_pts, json.dumps(log), user_id))
        points_awarded = 1

    elif status.lower() in ('rejected', 'cancelled') and points_awarded == 1:
        # Revert loyalty points from customer account
        if user_id and user_id != 'guest_user':
            c.execute('SELECT points, point_log FROM users WHERE id = ?', (user_id,))
            u = c.fetchone()
            if u:
                new_pts = max(0, int(u['points'] or 0) - earned)
                log = json.loads(u['point_log'] or '[]')
                log.insert(0, {
                    't': f'Order #{order_id} {status.lower()} (points reverted)',
                    'd': -earned,
                    'at': decided_at,
                    'order_id': order_id,
                    'balance': new_pts
                })
                c.execute('UPDATE users SET points = ?, point_log = ? WHERE id = ?', (new_pts, json.dumps(log), user_id))
        points_awarded = 0

    c.execute('''
        UPDATE orders
        SET contact = ?, subtotal = ?, discount = ?, delivery = ?, total = ?,
            earned = ?, status = ?, note = ?, items = ?, points_awarded = ?, voucher = ?
        WHERE id = ?
    ''', (contact_json, subtotal, discount, delivery, total, earned, status, note, items_json, points_awarded, voucher, order_id))

    bump_version('orders', conn)
    conn.commit()
    conn.close()

    return get_order(order_id), None

def wipe_orders(mode='all'):
    """
    Allow admin to wipe receipt or order history on admin panel.
    mode: 'all' -> wipe all orders
    mode: 'completed_only' -> wipe only completed, rejected, cancelled orders
    """
    conn = get_db()
    c = conn.cursor()
    if mode == 'completed_only':
        c.execute("SELECT id FROM orders WHERE lower(status) IN ('completed', 'approved', 'rejected', 'cancelled')")
        to_delete = [r['id'] for r in c.fetchall()]
        if to_delete:
            placeholders = ','.join(['?'] * len(to_delete))
            c.execute(f"DELETE FROM orders WHERE id IN ({placeholders})", to_delete)
            c.execute(f"DELETE FROM notifications WHERE order_id IN ({placeholders})", to_delete)
    else:
        c.execute("SELECT COUNT(*) as cnt FROM orders")
        cnt = c.fetchone()['cnt']
        c.execute("DELETE FROM orders")
        c.execute("DELETE FROM notifications WHERE type = 'order'")
        to_delete = list(range(cnt))

    deleted_count = len(to_delete)
    bump_version('orders', conn)
    conn.commit()
    conn.close()
    return deleted_count

def run_auto_wipe_orders():
    """
    Execute automatic wipe of receipt history based on admin settings:
    - auto_wipe_enabled: 'true'/'false'
    - auto_wipe_days: retention period in days (e.g. 7, 14, 30, 60, 90)
    - auto_wipe_scope: 'completed_only' or 'all'
    """
    from datetime import datetime, timedelta
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT key, val FROM settings WHERE key LIKE 'auto_wipe_%'")
    auto_settings = {r['key']: r['val'] for r in c.fetchall()}

    enabled = str(auto_settings.get('auto_wipe_enabled', 'false')).lower() in ('true', '1', 'yes')
    if not enabled:
        conn.close()
        return 0, "Auto-wipe is currently disabled"

    try:
        retention_days = max(1, int(auto_settings.get('auto_wipe_days', 30)))
    except (ValueError, TypeError):
        retention_days = 30

    scope = auto_settings.get('auto_wipe_scope', 'completed_only')
    cutoff = datetime.now() - timedelta(days=retention_days)
    cutoff_iso = cutoff.isoformat()

    if scope == 'completed_only':
        c.execute('''
            SELECT id FROM orders
            WHERE created_at <= ? AND lower(status) IN ('completed', 'approved', 'rejected', 'cancelled')
        ''', (cutoff_iso,))
    else:
        c.execute('''
            SELECT id FROM orders
            WHERE created_at <= ?
        ''', (cutoff_iso,))

    rows = c.fetchall()
    to_delete = [r['id'] for r in rows]

    if to_delete:
        placeholders = ','.join(['?'] * len(to_delete))
        c.execute(f"DELETE FROM orders WHERE id IN ({placeholders})", to_delete)
        c.execute(f"DELETE FROM notifications WHERE order_id IN ({placeholders})", to_delete)
        bump_version('orders', conn)

    now_iso = datetime.now().isoformat()
    c.execute("INSERT OR REPLACE INTO settings (key, val) VALUES ('auto_wipe_last_run', ?)", (now_iso,))
    conn.commit()
    conn.close()

    return len(to_delete), f"Auto-wiped {len(to_delete)} expired receipts older than {retention_days} days"

# --- Notifications ---
def get_notifications(user_id=None):
    conn = get_db()
    c = conn.cursor()
    if user_id:
        c.execute('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', (user_id,))
    else:
        c.execute('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 40')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    for n in rows:
        n['read'] = bool(n['read'])
    return rows

def mark_notifications_read(order_id=None):
    conn = get_db()
    c = conn.cursor()
    if order_id:
        c.execute('UPDATE notifications SET read = 1 WHERE order_id = ?', (order_id,))
    else:
        c.execute('UPDATE notifications SET read = 1')
    bump_version('notifications', conn)
    conn.commit()
    conn.close()
    return True

# --- Charms (Italy Charm Bracelet Links & Customizer Studio) ---
def get_charms(include_inactive=False, category=None):
    conn = get_db()
    c = conn.cursor()
    query = 'SELECT * FROM charms'
    params = []
    conditions = []
    if not include_inactive:
        conditions.append('active = 1')
    if category and category != 'All':
        conditions.append('category = ?')
        params.append(category)
    if conditions:
        query += ' WHERE ' + ' AND '.join(conditions)
    query += ' ORDER BY sort_order ASC, name ASC'
    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

def get_charm(charm_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM charms WHERE id = ?', (charm_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_charm(data):
    conn = get_db()
    c = conn.cursor()
    charm_id = str(data.get('id', '')).strip()
    if not charm_id or charm_id.startswith('ch_'):
        # Auto-generate next clean short charm ID (C01..C99)
        c.execute("SELECT id, model_no FROM charms")
        existing_rows = c.fetchall()
        max_num = 0
        import re
        for r in existing_rows:
            cid = str(r[0] or '')
            cmodel = str(r[1] or '')
            m = re.search(r'C0*(\d+)', cid, re.I) or re.search(r'MD-0*(\d+)', cmodel, re.I)
            if m:
                max_num = max(max_num, int(m.group(1)))
        next_num = max_num + 1
        charm_id = f"C{next_num:02d}"

    name = str(data.get('name', 'Italy Charm')).strip() or 'Italy Charm'
    category = str(data.get('category', 'Classic')).strip() or 'Classic'
    price = round(float(data.get('price', 0.75)), 2)
    price_khr = int(data.get('price_khr') or round(price * 4100))
    stock = int(data.get('stock', 99))
    image = str(data.get('image', '')).strip() or 'https://via.placeholder.com/150?text=Charm'
    if 'base64,' in image:
        try:
            import base64, io
            from PIL import Image
            prefix, b64_str = image.split('base64,', 1)
            raw = base64.b64decode(b64_str)
            im = Image.open(io.BytesIO(raw))
            bbox = im.getbbox()
            if bbox:
                cropped = im.crop(bbox)
                buf = io.BytesIO()
                cropped.save(buf, format='PNG')
                image = prefix + 'base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')
        except Exception as e:
            pass
    sort_order = int(data.get('sort_order', 0))
    active = int(data.get('active', 1))
    model_no = str(data.get('model_no', '')).strip()
    if not model_no:
        import re
        m = re.search(r'C0*(\d+)', charm_id, re.I)
        num = int(m.group(1)) if m else (sort_order or 1)
        model_no = f"MD-{num:03d}"
    color = str(data.get('color', 'Silver')).strip() or 'Silver'

    c.execute('SELECT id FROM charms WHERE id = ?', (charm_id,))
    existing = c.fetchone()

    if existing:
        c.execute('''
            UPDATE charms
            SET name = ?, category = ?, price = ?, price_khr = ?, stock = ?, image = ?, sort_order = ?, active = ?, model_no = ?, color = ?
            WHERE id = ?
        ''', (name, category, price, price_khr, stock, image, sort_order, active, model_no, color, charm_id))
    else:
        c.execute('''
            INSERT INTO charms (id, name, category, price, price_khr, stock, image, sort_order, active, model_no, color, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (charm_id, name, category, price, price_khr, stock, image, sort_order, active, model_no, color, now()))

    bump_version('charms', conn)
    conn.commit()
    conn.close()
    return get_charm(charm_id)

def delete_charm(charm_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM charms WHERE id = ?', (charm_id,))
    bump_version('charms', conn)
    conn.commit()
    conn.close()
    return True

def adjust_charm_stock(charm_id, delta=None, new_stock=None):
    conn = get_db()
    c = conn.cursor()
    if new_stock is not None:
        c.execute('UPDATE charms SET stock = ? WHERE id = ?', (max(0, int(new_stock)), charm_id))
    elif delta is not None:
        c.execute('UPDATE charms SET stock = MAX(0, stock + ?) WHERE id = ?', (int(delta), charm_id))
    bump_version('charms', conn)
    conn.commit()
    conn.close()
    return get_charm(charm_id)

def seed_default_charms():
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM charms')
    seed_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'default_charms.json')
    seeded_count = 0
    if os.path.exists(seed_file):
        with open(seed_file, 'r', encoding='utf-8') as f:
            charms_list = json.load(f)
        for idx, item in enumerate(charms_list):
            item_model = str(item.get('model_no', '')).strip() or f"MD-{(idx+1):03d}"
            item_color = str(item.get('color', 'Silver')).strip() or 'Silver'
            c.execute('''
                INSERT INTO charms (id, name, category, price, price_khr, stock, image, sort_order, active, model_no, color, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                item.get('id', f'ch_{idx}'),
                item.get('name', f'Charm {idx+1}'),
                item.get('category', 'Classic'),
                float(item.get('price', 0.75)),
                int(item.get('price_khr', 3000)),
                int(item.get('stock', 99)),
                item.get('image', ''),
                int(item.get('sort_order', idx)),
                int(item.get('active', 1)),
                item_model,
                item_color,
                now()
            ))
            seeded_count += 1
    bump_version('charms', conn)
    conn.commit()
    conn.close()
    return seeded_count

def clear_charms():
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM charms')
    bump_version('charms', conn)
    conn.commit()
    conn.close()
    return True

def get_charm_categories():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT category, COUNT(*) as cnt, MIN(image) as thumb FROM charms WHERE active = 1 GROUP BY category ORDER BY cnt DESC')
    cats = [dict(r) for r in c.fetchall()]
    conn.close()
    return cats

def reset_database():
    conn = get_db()
    c = conn.cursor()
    # Drop existing tables cleanly
    c.execute('DROP TABLE IF EXISTS notifications')
    c.execute('DROP TABLE IF EXISTS orders')
    c.execute('DROP TABLE IF EXISTS users')
    c.execute('DROP TABLE IF EXISTS products')
    c.execute('DROP TABLE IF EXISTS categories')
    c.execute('DROP TABLE IF EXISTS category_filters')
    c.execute('DROP TABLE IF EXISTS charms')
    c.execute('DROP TABLE IF EXISTS settings')
    c.execute('DROP TABLE IF EXISTS admin_auth')
    c.execute('DROP TABLE IF EXISTS sync_versions')
    conn.commit()
    conn.close()

    # Recreate tables and default settings/categories (leaving products and charms completely empty)
    init_db()

    return True

# Initialize database on module import
init_db()

