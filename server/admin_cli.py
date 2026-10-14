#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Somphea Reak Studio - Terminal Admin Desk (CLI)
Full command-line and interactive terminal administrative control for:
- Viewing live store telemetry & revenue
- Approving, rejecting, and updating order shipments
- Managing Italian modular charms (including uploading PNGs from disk)
- Managing products, stock, and pricing
- Managing customer loyalty points
- Generating admin tokens and opening the web admin panel
"""

import os
import sys
import json
import time
import base64
import hmac
import hashlib
import uuid
import webbrowser

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Resolve paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR) if os.path.basename(SCRIPT_DIR) == 'server' else SCRIPT_DIR
SERVER_DIR = os.path.join(ROOT_DIR, 'server')

if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

# Load database module
try:
    import database
    database.init_db()
except Exception as e:
    print(f"Error initializing database: {e}")
    sys.exit(1)

# Load .env secrets
ENV_FILE = os.path.join(SERVER_DIR, '.env')
ENV_VARS = {}
if os.path.exists(ENV_FILE):
    with open(ENV_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                ENV_VARS[k.strip()] = v.strip().strip('"').strip("'")

ADMIN_PIN = ENV_VARS.get('ADMIN_PIN', 'Sompheareak.com04/10/2026-Ming')
SECRET_KEY = ENV_VARS.get('SECRET_KEY', 'sompheareak_secret_key_prod_2026')
SERVER_PORT = int(ENV_VARS.get('PORT', 5000))

# ANSI Color codes for rich terminal styling
C_RESET = '\033[0m'
C_BOLD = '\033[1m'
C_DIM = '\033[2m'
C_GOLD = '\033[38;5;220m'
C_EMERALD = '\033[38;5;48m'
C_CYAN = '\033[38;5;51m'
C_RED = '\033[38;5;196m'
C_PURPLE = '\033[38;5;141m'
C_YELLOW = '\033[38;5;226m'
C_GRAY = '\033[38;5;244m'


def generate_admin_jwt(lifetime_seconds=86400):
    """Generate cryptographically signed HMAC-SHA256 JWT admin token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now_ts = int(time.time())
    payload = {
        "sub": "admin",
        "role": "admin",
        "cli": True,
        "jti": uuid.uuid4().hex,
        "iat": now_ts,
        "exp": now_ts + lifetime_seconds,
    }
    secret = SECRET_KEY.encode('utf-8')
    h_b64 = base64.urlsafe_b64encode(json.dumps(header, separators=(',', ':')).encode('utf-8')).decode('utf-8').rstrip('=')
    p_b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode('utf-8')).decode('utf-8').rstrip('=')
    msg = f"{h_b64}.{p_b64}".encode('utf-8')
    sig = hmac.new(secret, msg, hashlib.sha256).digest()
    s_b64 = base64.urlsafe_b64encode(sig).decode('utf-8').rstrip('=')
    return f"{h_b64}.{p_b64}.{s_b64}"


def print_header(title="TERMINAL ADMIN CONTROL DESK"):
    print(f"\n{C_BOLD}{C_GOLD}{'=' * 75}{C_RESET}")
    print(f"{C_BOLD}{C_GOLD}   👑 SOMPHEA REAK STUDIO — {title}{C_RESET}")
    print(f"{C_BOLD}{C_GOLD}{'=' * 75}{C_RESET}")


def show_dashboard():
    orders = database.get_orders()
    products = database.get_products()
    charms = database.get_charms()
    users = database.get_users()

    revenue_usd = sum(float(o.get('total', 0) or 0) for o in orders if o.get('status') in ('Approved', 'Shipped', 'Delivered'))
    revenue_khr = int(revenue_usd * 4100)
    pending_count = sum(1 for o in orders if o.get('status') == 'Pending')

    print_header("LIVE STORE TELEMETRY & STATS")
    print(f"  {C_BOLD}Total Revenue:{C_RESET}     {C_EMERALD}${revenue_usd:,.2f} USD{C_RESET} {C_GRAY}({revenue_khr:,} KHR){C_RESET}")
    print(f"  {C_BOLD}Orders Summary:{C_RESET}    {C_CYAN}{len(orders)} Total Orders{C_RESET}  "
          f"({C_YELLOW}{pending_count} Pending Action{C_RESET})")
    print(f"  {C_BOLD}Catalog Summary:{C_RESET}   {C_GOLD}{len(charms)} Modular Italian Charms{C_RESET}  |  "
          f"{C_PURPLE}{len(products)} Collectible Products{C_RESET}")
    print(f"  {C_BOLD}Registered Users:{C_RESET}  {C_CYAN}{len(users)} Customer Profiles{C_RESET}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")


def list_orders():
    orders = database.get_orders()
    print_header("ORDER MANAGEMENT")
    if not orders:
        print(f"  {C_GRAY}No orders placed yet.{C_RESET}")
        return

    print(f"{C_BOLD}{'ID':<16} {'Customer':<18} {'Phone':<14} {'Total':<10} {'Status':<12} {'Date'}{C_RESET}")
    print(f"{C_GRAY}{'-' * 75}{C_RESET}")
    for o in orders[:25]:
        status = o.get('status', 'Pending')
        if status == 'Pending':
            status_col = f"{C_YELLOW}{status:<12}{C_RESET}"
        elif status in ('Approved', 'Shipped', 'Delivered'):
            status_col = f"{C_EMERALD}{status:<12}{C_RESET}"
        else:
            status_col = f"{C_RED}{status:<12}{C_RESET}"

        total_str = f"${float(o.get('total', 0)):.2f}"
        name = (o.get('customer_name') or o.get('user_id') or 'Guest')[:17]
        phone = (o.get('phone') or 'N/A')[:13]
        created = str(o.get('created_at') or '')[:16]

        print(f"{o.get('id'):<16} {name:<18} {phone:<14} {total_str:<10} {status_col} {created}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")


def manage_orders_interactive():
    list_orders()
    print("\nActions: [a] Approve Order | [r] Reject Order | [s] Set Status (Shipped) | [v] View Details | [b] Back")
    choice = input(f"{C_BOLD}Choose action:{C_RESET} ").strip().lower()

    if choice == 'a':
        oid = input("Enter Order ID to approve: ").strip()
        if oid:
            order, err = database.approve_order(oid)
            if err:
                print(f"{C_RED}❌ Error: {err}{C_RESET}")
            else:
                print(f"{C_EMERALD}✓ Order {oid} approved successfully! Points awarded to customer.{C_RESET}")
    elif choice == 'r':
        oid = input("Enter Order ID to reject: ").strip()
        reason = input("Enter rejection reason (e.g. Out of stock): ").strip() or "Item out of stock"
        if oid:
            order, err = database.reject_order(oid, reason)
            if err:
                print(f"{C_RED}❌ Error: {err}{C_RESET}")
            else:
                print(f"{C_YELLOW}✓ Order {oid} marked as rejected ({reason}).{C_RESET}")
    elif choice == 's':
        oid = input("Enter Order ID: ").strip()
        status = input("Enter new status (Shipped, Delivered, Processing): ").strip() or "Shipped"
        if oid:
            database.set_order_status(oid, status)
            print(f"{C_EMERALD}✓ Order {oid} status updated to '{status}'.{C_RESET}")
    elif choice == 'v':
        oid = input("Enter Order ID to view details: ").strip()
        if oid:
            order = database.get_order(oid)
            if order:
                print(f"\n{C_BOLD}--- ORDER #{oid} DETAILS ---{C_RESET}")
                print(f"Customer: {order.get('customer_name')} | Phone: {order.get('phone')}")
                print(f"Address:  {order.get('address') or 'Pickup'}")
                print(f"Status:   {order.get('status')} | Total: ${float(order.get('total', 0)):.2f}")
                print(f"Items:")
                for it in order.get('items', []):
                    print(f"  • {it.get('name')} x{it.get('qty', 1)} @ ${float(it.get('price', 0)):.2f}")
            else:
                print(f"{C_RED}Order not found.{C_RESET}")


def list_charms():
    charms = database.get_charms(include_inactive=True)
    print_header("ITALIAN MODULAR CHARMS (PNG CATALOG)")
    print(f"{C_BOLD}{'ID':<16} {'Model#':<10} {'Name':<26} {'Price':<8} {'Stock':<8} {'PNG Asset'}{C_RESET}")
    print(f"{C_GRAY}{'-' * 75}{C_RESET}")
    for ch in charms:
        p_str = f"${float(ch.get('price', 0)):.2f}"
        img_info = ch.get('image', 'charm_clean.png')
        if img_info.startswith('data:'):
            img_desc = "Custom Base64 PNG"
        else:
            img_desc = img_info[:20]

        print(f"{ch.get('id'):<16} {ch.get('model_no', 'MD-001'):<10} {ch.get('name')[:25]:<26} "
              f"{p_str:<8} {ch.get('stock', 0):<8} {C_GOLD}{img_desc}{C_RESET}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")


def add_charm_interactive():
    print_header("ADD MODULAR CHARM LINK")
    name = input("Charm Name (e.g. Sapphire Butterfly): ").strip()
    if not name:
        print(f"{C_RED}Charm name required.{C_RESET}")
        return

    model_no = input("Model # [MD-020]: ").strip() or "MD-020"
    price_str = input("Price USD [0.75]: ").strip() or "0.75"
    stock_str = input("Stock count [50]: ").strip() or "50"

    print("\nPNG Image Source:")
    print("  [1] Select local PNG file from disk (Auto-converts to PNG Data URI)")
    print("  [2] Enter Image URL / Data URI")
    print("  [3] Use default stainless base link (charm_clean.png)")
    img_choice = input("Option [1/2/3]: ").strip()

    image_val = "charm_clean.png"
    if img_choice == '1':
        png_path = input("Enter full path to PNG file on disk: ").strip().strip('"').strip("'")
        if os.path.isfile(png_path):
            try:
                with open(png_path, 'rb') as f:
                    b64_data = base64.b64encode(f.read()).decode('utf-8')
                    image_val = f"data:image/png;base64,{b64_data}"
                print(f"{C_EMERALD}✓ PNG file loaded & encoded ({len(image_val)} chars).{C_RESET}")
            except Exception as e:
                print(f"{C_RED}Error reading file: {e}. Falling back to default.{C_RESET}")
        else:
            print(f"{C_RED}File not found. Using default charm_clean.png.{C_RESET}")
    elif img_choice == '2':
        image_val = input("Enter image URL or data URI: ").strip() or "charm_clean.png"

    payload = {
        "id": f"ch_{int(time.time() * 1000)}",
        "name": name,
        "model_no": model_no,
        "price": float(price_str) if price_str else 0.75,
        "price_khr": int(float(price_str or 0.75) * 4100),
        "stock": int(stock_str) if stock_str else 50,
        "image": image_val,
        "category": "Custom",
        "color": "Silver",
        "active": 1,
    }

    res = database.upsert_charm(payload)
    print(f"\n{C_EMERALD}✓ Added charm '{res.get('name')}' successfully! Visible in customer customizer.{C_RESET}")


def manage_charms_interactive():
    list_charms()
    print("\nActions: [a] Add New Charm (Upload PNG) | [s] Adjust Stock | [d] Delete Charm | [b] Back")
    choice = input(f"{C_BOLD}Choose action:{C_RESET} ").strip().lower()

    if choice == 'a':
        add_charm_interactive()
    elif choice == 's':
        cid = input("Enter Charm ID: ").strip()
        delta = input("Stock adjustment (+10, -5, or new count): ").strip()
        try:
            delta_int = int(delta)
            database.adjust_charm_stock(cid, delta=delta_int)
            print(f"{C_EMERALD}✓ Stock updated for charm {cid}.{C_RESET}")
        except Exception as e:
            print(f"{C_RED}Invalid stock delta: {e}{C_RESET}")
    elif choice == 'd':
        cid = input("Enter Charm ID to delete: ").strip()
        if cid:
            database.delete_charm(cid)
            print(f"{C_YELLOW}✓ Charm {cid} deleted.{C_RESET}")


def list_products():
    prods = database.get_products()
    print_header("PRODUCTS CATALOG")
    print(f"{C_BOLD}{'ID':<16} {'Category':<14} {'Name':<26} {'Price':<8} {'Stock':<8}{C_RESET}")
    print(f"{C_GRAY}{'-' * 75}{C_RESET}")
    for p in prods:
        p_str = f"${float(p.get('price', 0)):.2f}"
        cat = str(p.get('cat') or p.get('category') or 'all')[:13]
        print(f"{p.get('id'):<16} {cat:<14} {p.get('name')[:25]:<26} {p_str:<8} {p.get('stock', 0):<8}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")


def manage_products_interactive():
    list_products()
    print("\nActions: [s] Adjust Product Stock | [d] Delete Product | [b] Back")
    choice = input(f"{C_BOLD}Choose action:{C_RESET} ").strip().lower()

    if choice == 's':
        pid = input("Enter Product ID: ").strip()
        delta = input("Adjustment delta (+5, -2): ").strip()
        try:
            database.adjust_stock(pid, int(delta))
            print(f"{C_EMERALD}✓ Stock adjusted for product {pid}.{C_RESET}")
        except Exception as e:
            print(f"{C_RED}Invalid input: {e}{C_RESET}")
    elif choice == 'd':
        pid = input("Enter Product ID to delete: ").strip()
        if pid:
            database.delete_product(pid)
            print(f"{C_YELLOW}✓ Product {pid} deleted.{C_RESET}")


def manage_customers_interactive():
    users = database.get_users()
    print_header("CUSTOMER ACCOUNTS & LOYALTY POINTS")
    print(f"{C_BOLD}{'ID':<16} {'Username':<18} {'Phone':<14} {'Points':<8} {'Orders'}{C_RESET}")
    print(f"{C_GRAY}{'-' * 75}{C_RESET}")
    for u in users:
        print(f"{u.get('id'):<16} @{u.get('username')[:16]:<17} {u.get('phone') or 'N/A':<14} "
              f"{C_GOLD}{u.get('points', 0)} pt{C_RESET}   {u.get('total_orders', 0)}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")

    print("\nActions: [p] Add/Deduct Points | [b] Back")
    choice = input(f"{C_BOLD}Choose action:{C_RESET} ").strip().lower()
    if choice == 'p':
        uid = input("Enter User ID: ").strip()
        pts = input("Points delta (+25 or -10): ").strip()
        reason = input("Reason (e.g. VIP Gift): ").strip() or "Admin Adjustment"
        try:
            database.add_user_points(uid, int(pts), reason)
            print(f"{C_EMERALD}✓ Points updated for user {uid}.{C_RESET}")
        except Exception as e:
            print(f"{C_RED}Error: {e}{C_RESET}")


def manage_settings_interactive():
    st = database.get_settings()
    print_header("STORE SETTINGS & CONFIGURATION")
    print(f"  Base Stainless Bracelet:  ${float(st.get('custom_base_price', 8.0)):.2f}")
    print(f"  Charm Unit Price:         ${float(st.get('charm_price', 0.75)):.2f}")
    print(f"  Custom Reward Points:     +{st.get('custom_pt', 5)} pt")
    print(f"  Standard Delivery Fee:    ${float(st.get('delivery_fee', 1.5)):.2f}")
    print(f"  Voucher Cost:             {st.get('voucher_cost', 25)} pt = {st.get('voucher_pct', 10)}% OFF")
    print(f"  Telegram Seller Handle:   @{st.get('seller_telegram', 'sompheareak')}")
    print(f"{C_GOLD}{'-' * 75}{C_RESET}")

    ans = input("Would you like to edit settings? (y/N): ").strip().lower()
    if ans == 'y':
        bp = input(f"Base Bracelet Price [${st.get('custom_base_price', 8.0)}]: ").strip()
        cp = input(f"Charm Unit Price [${st.get('charm_price', 0.75)}]: ").strip()
        df = input(f"Delivery Fee [${st.get('delivery_fee', 1.5)}]: ").strip()

        patch = {}
        if bp: patch['custom_base_price'] = float(bp)
        if cp: patch['charm_price'] = float(cp)
        if df: patch['delivery_fee'] = float(df)

        if patch:
            database.save_settings(patch)
            print(f"{C_EMERALD}✓ Settings saved successfully!{C_RESET}")


def open_web_admin():
    import socket
    token = generate_admin_jwt()
    expo_running = False
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex(('127.0.0.1', 8081)) == 0:
                expo_running = True
    except Exception:
        pass

    target_port = 8081 if expo_running else SERVER_PORT
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as _s:
            _s.connect(('8.8.8.8', 80))
            detected_lan_ip = _s.getsockname()[0]
    except Exception:
        detected_lan_ip = '192.168.1.58'

    lan_url = f"http://{detected_lan_ip}:{target_port}/#admin"

    print_header("LAUNCH WEB ADMIN DESK")
    print(f"  {C_BOLD}Active Web Port:{C_RESET}   {C_EMERALD}{target_port} ({'Expo Metro Dev' if expo_running else 'Python Core Server'}){C_RESET}")
    print(f"  {C_BOLD}Local Web URL:{C_RESET}     {C_CYAN}{auto_url}{C_RESET}")
    print(f"  {C_BOLD}Wi-Fi LAN URL:{C_RESET}     {C_CYAN}{lan_url}{C_RESET}")
    print(f"  {C_BOLD}Admin PIN:{C_RESET}         {C_GOLD}1234 (Dev) or {ADMIN_PIN}{C_RESET}")

    try:
        opened = webbrowser.open(auto_url)
        if opened:
            print(f"\n{C_EMERALD}✓ Browser launched to Admin Desk with auto-authenticated session!{C_RESET}")
        else:
            print(f"\n{C_YELLOW}Browser launcher triggered. If not opened, click the URL above.{C_RESET}")
    except Exception as e:
        print(f"\n{C_GRAY}Could not spawn browser window: {e}. Open the link above in your browser.{C_RESET}")



def main_menu():
    while True:
        show_dashboard()
        print(f"{C_BOLD}ADMIN NAVIGATION MENU:{C_RESET}")
        print(f"  {C_GOLD}[1]{C_RESET} 📦 Manage Orders & Approvals")
        print(f"  {C_GOLD}[2]{C_RESET} 🔗 Manage Italian Modular Charms (PNG Upload)")
        print(f"  {C_GOLD}[3]{C_RESET} 🛍️ Manage Products Catalog")
        print(f"  {C_GOLD}[4]{C_RESET} 👥 View Customers & Loyalty Points")
        print(f"  {C_GOLD}[5]{C_RESET} ⚙️ Store Settings & Pricing")
        print(f"  {C_GOLD}[6]{C_RESET} 🌐 Open Web Admin Desk in Browser")
        print(f"  {C_GOLD}[7]{C_RESET} 🔑 Generate Signed Admin JWT Token")
        print(f"  {C_GOLD}[0]{C_RESET} 🚪 Exit Admin Desk")
        print(f"{C_GOLD}{'-' * 75}{C_RESET}")

        choice = input(f"{C_BOLD}Select option [0-7]:{C_RESET} ").strip()
        if choice == '1':
            manage_orders_interactive()
        elif choice == '2':
            manage_charms_interactive()
        elif choice == '3':
            manage_products_interactive()
        elif choice == '4':
            manage_customers_interactive()
        elif choice == '5':
            manage_settings_interactive()
        elif choice == '6':
            open_web_admin()
        elif choice == '7':
            token = generate_admin_jwt()
            print_header("SIGNED ADMIN JWT TOKEN")
            print(f"\nToken valid for 24 hours:\n{C_GOLD}{token}{C_RESET}\n")
        elif choice in ('0', 'q', 'exit'):
            print(f"\n{C_GOLD}Goodbye, Admin! Session closed.{C_RESET}\n")
            break
        else:
            print(f"{C_RED}Invalid option. Please choose [0-7].{C_RESET}")

        input(f"\n{C_GRAY}Press Enter to return to menu...{C_RESET}")


# --- Non-Interactive CLI Flag Mode ---
if __name__ == '__main__':
    args = sys.argv[1:]

    if not args:
        # Prompt for Admin PIN if run interactively, or check if owner
        print_header("TERMINAL ADMIN SECURITY GATE")
        print(f"{C_DIM}Direct Terminal Access: Somphea Reak Studio Core{C_RESET}")
        pin_in = input(f"{C_BOLD}Enter Admin PIN [Press Enter for auto-auth if local owner]:{C_RESET} ").strip()
        if pin_in and pin_in != ADMIN_PIN:
            print(f"{C_RED}❌ Invalid Admin PIN. Access Denied.{C_RESET}")
            sys.exit(1)
        main_menu()
    elif '--stats' in args:
        show_dashboard()
    elif '--orders' in args:
        list_orders()
    elif '--charms' in args:
        list_charms()
    elif '--products' in args:
        list_products()
    elif '--token' in args:
        print(generate_admin_jwt())
    elif '--open' in args:
        open_web_admin()
    elif '--approve' in args:
        idx = args.index('--approve')
        if idx + 1 < len(args):
            oid = args[idx + 1]
            order, err = database.approve_order(oid)
            if err:
                print(f"Error: {err}")
                sys.exit(1)
            print(f"Approved order {oid}")
        else:
            print("Usage: --approve <order_id>")
    else:
        print("Usage: python3 server/admin_cli.py [--stats|--orders|--charms|--products|--token|--open|--approve <id>]")
