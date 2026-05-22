# Deployment Guide — Floating Side Navigation

## Prerequisites

- Node.js >= 18.20.4
- PostgreSQL database
- Shopify Partner account
- Shopify CLI (`npm i -g @shopify/cli`)

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in:

```
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,read_collections,write_pixels,read_customer_events
HOST=https://your-app-url.com
DATABASE_URL=postgresql://user:password@host:5432/floating_sidenav
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Database Setup

```bash
npx prisma generate
npx prisma migrate deploy
```

---

## 4. Local Development

```bash
npm run dev
```

This starts the Shopify CLI dev tunnel and Remix server together.

---

## 5. Production Build

```bash
npm run build
```

---

## 6. Deploy to Fly.io

```bash
# Install flyctl
fly launch
fly secrets set SHOPIFY_API_KEY=xxx SHOPIFY_API_SECRET=xxx DATABASE_URL=xxx
fly deploy
```

---

## 7. Deploy to Render

1. Create a new Web Service pointing to this repo
2. Build command: `npm install && npx prisma migrate deploy && npm run build`
3. Start command: `npm run start`
4. Add all environment variables in the Render dashboard

---

## 8. Theme App Extension

After deploying, push the extension:

```bash
npm run deploy
```

The extension will be available in the merchant's Shopify Theme Editor under
**App Embeds → Floating Side Navigation**.

---

## 9. App Embed Setup (Merchant Guide)

1. Go to **Shopify Admin → Online Store → Themes → Customize**
2. Click **App Embeds** in the left panel
3. Enable **Floating Side Navigation**
4. Save the theme

---

## Architecture Notes

- **Admin**: Remix + Polaris (embedded Shopify app)
- **Storefront**: Theme App Extension (vanilla JS + CSS, no framework)
- **Data flow**: Sidebar JS → `/api/sidebar-data?shop=...` → renders sidebar
- **Auth**: Shopify OAuth via `@shopify/shopify-app-remix`
- **DB**: PostgreSQL via Prisma ORM
