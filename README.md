# Somphea Reak Studio – Admin Management Panel & Backend Suite

> **Cambodia Kingdom of Wonder • Premium Collectibles, Toys & Customizable Italy Charm Jewelry**  
> Complete Admin Management Desk built with React Native / Expo Web + Python REST API & SQLite sync engine.

---

## 🛠️ Included Admin Modules

- **PIN Security Gate**: Protected administration console with rate-limiting and session management.
- **Real-Time Order Desk**: Live order stream, auto audio alerts, status workflow (Pending, Approved, Shipped, Rejected), and thermal receipt editor.
- **Product & Inventory Manager**: Create, edit, search, and manage stock for collectibles, figurines, and studio products.
- **9mm Italian Charm Jewelry Engine**: Live stock controls, charm pricing, and custom link catalog management.
- **Customer Loyalty & Points Desk**: Direct customer lookup, Telegram links, loyalty point adjustments, and voucher redemptions.
- **Category & Filter Matrix**: Dynamic multi-category grouping, badge tags, and storefront organization.
- **Admin CLI (`server/admin_cli.py`)**: Terminal-based administrative toolkit for rapid database inspection, data seeding, and backups.
- **Python REST API (`server/server.py`)**: Flask backend API with CORS, JWT authentication, and SQLite persistence.

---

## 🚀 Quick Start (Local Development)

### 1. Run Admin Web Desk
```bash
# Install dependencies
npm install

# Launch Admin Panel (default: http://localhost:8082)
npm run web

# Or start with Expo bundler
npm start
```

### 2. Run Backend Server (Optional if connecting to remote API)
```bash
cd server
pip install -r requirements.txt
cp .env.example .env
./run_server.sh
```

### 3. Run Admin CLI Tool
```bash
python3 server/admin_cli.py --open
```

---

## 🌐 Deploy Admin Desk as a Website

### Option 1: Vercel (Recommended — One Click)
1. Push this repository to GitHub (`sompheareak-admin`).
2. Go to [Vercel Dashboard](https://vercel.com/new) and import your `sompheareak-admin` repository.
3. Vercel automatically detects the build configuration via `vercel.json`:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Set Environment Variable:
   - `EXPO_PUBLIC_API_URL`: Your live backend API URL (e.g. `https://api.sompheareak.com`)
5. Click **Deploy**!

### Option 2: Netlify
1. Import repository on [Netlify](https://app.netlify.com/start).
2. The included `netlify.toml` automatically configures:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **SPA Redirects**: `/* -> /index.html`
3. Set `EXPO_PUBLIC_API_URL` under Site configuration > Environment variables.
4. Click **Deploy site**!

### Option 3: Manual Static Build
```bash
# Export static production website into ./dist
npm run build

# Preview locally
npm run preview
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | Base URL of the Somphea Reak API server | Auto-resolves (`http://localhost:5000` or same-origin) |

---

## 📄 License

See [LICENSE](LICENSE) for full proprietary license terms.  
Copyright © 2026 Somphea Reak Studio (សម្ភារៈ). All Rights Reserved.
