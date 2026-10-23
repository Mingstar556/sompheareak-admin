# 🛡️ Somphea Reak – Admin Management Desk & Control Suite

The dedicated, standalone administration suite for **Somphea Reak (សម្ភារៈ)** Toy & Charm Studio.

## 🚀 Architecture
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + Framer Motion + Lucide Icons
- **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **Hosting**: Render.com Web Service
- **Companion App**: [sompheareak-pro](https://github.com/Mingstar556/sompheareak-pro) (Customer Storefront sharing the exact same Neon DB)

## 📦 Features
- 🔐 **PIN Access Gate**: Fast and secure admin login.
- 📦 **Products Management**: Add custom products with images, prices, stock counts, tags, descriptions, and category assignment; edit and delete live.
- ✨ **Charms Management**: Add custom charms with high-res link plates, automatic unique charm code generation (`GF1`, `CAT`, `P01`, etc.), and real-time inventory management.
- 📋 **Orders Management**: Real-time customer orders feed, status progression (Pending -> Confirmed -> Packaging -> Shipped -> Delivered -> Rejected), printable receipts, and 1-click customer Telegram chat.
- 🏷️ **Categories & Filters Builder**: Create custom product categories and filter tags with Khmer/English localization and emojis.
- 🍱 **Category Bento 3-Box Manager**: Customize the 3 featured bento categories shown at the very top of the customer storefront.
- ⚙️ **Storefront Live Editor**: Update top announcement banner, hero badge, hero title, subtitle, and free delivery threshold in real-time.
- 🎟️ **Vouchers & Discounts**: Create promotional discount codes, manage point costs and minimum order requirements.
- 🔔 **Notification Center**: View customer notifications and broadcast announcements.

## 🛠️ Deploy to Render.com

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
2. Connect your GitHub repository `Mingstar556/sompheareak-admin`.
3. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add the following **Environment Variables**:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string (must be the **same** as `sompheareak-pro`):
     ```
     postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-PROJECT.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - `NEXT_PUBLIC_STOREFRONT_URL`: URL to your deployed `sompheareak-pro` web service.
5. Click **Deploy Web Service**.
