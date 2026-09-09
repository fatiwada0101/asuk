# Asuk Tech WiFi Portal & Super Admin Suite

A modern, high-performance WiFi Hotspot Management, User Portal, and Super Admin Platform built with **Next.js 14 App Router**, **Supabase**, and integrated with **MikroTik RouterOS REST API** and **Flutterwave Payment Gateway**.

---

## ⚡ Key Features

### 👤 User Portal & Hotspot Experience
- **Voucher & Pass Purchase**: Instant purchase of WiFi plans (1 Hour, 3 Hours, 24 Hours, 7 Days, 30 Days) with direct wallet checkout or online payment.
- **Digital Wallet**: Secure in-app wallet top-up powered by Flutterwave with duplicate-prevention and idempotency guarantees.
- **Active Hotspot Session Tracker**: Real-time status of connected device, IP, MAC address, uptime, and downloaded/uploaded bytes.
- **Voucher Wallet & Code Activation**: Store generated vouchers, copy codes with 1-click, and activate on MikroTik hotspot.
- **Dark/Light Mode**: Full responsive UI tailored for mobile, tablet, and desktop screens with smooth glassmorphism styling.

### 🛡️ Super Admin Control Center (`/super-admin`)
- **Infrastructure & Dynamic Service Sync**:
  - **MikroTik RouterOS**: Configure Router IP, REST port, credentials, and test connection dynamically. Live session monitoring, user kicking, and bulk voucher generation directly to router profiles.
  - **Flutterwave**: Enable/disable gateway toggle, input Public & Secret API keys with instant runtime synchronization across user top-ups and webhooks.
- **Financial Intelligence & Analytics (`/api/super-admin/finance`)**:
  - Daily, Weekly, Monthly, and Custom Date Range filtering.
  - Revenue, transaction volume, average order value, and profit estimation.
  - Multi-format exports: **PDF Financial Summary** & **Excel (CSV) Spreadsheet**.
  - Verified revenue metrics (isolates actual user purchases from admin-generated test vouchers).
- **Collapsible Admin Navigation**: Sleek, collapsible sidebar for optimal workspace utilization.
- **System Health & Router Diagnostics**: Real-time CPU load, memory usage, uptime, active hotspot leases, and database connectivity checks.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database & Auth**: Supabase (PostgreSQL with Row Level Security & Atomic RPC functions)
- **Network Integration**: MikroTik RouterOS v7.x+ REST API
- **Payments**: Flutterwave v3 API
- **Styling**: Vanilla CSS design system with CSS custom properties & modern glassmorphism

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/fatiwada0101/asuk.git
cd asuk
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables Setup
Copy the example configuration file:
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials and optional public web app URL:
```env
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Public Web App URL (Optional - defaults to browser origin or Super Admin branding settings)
NEXT_PUBLIC_APP_URL=https://wifi.yourisp.com

# MikroTik Defaults (Optional, can also be configured dynamically in Super Admin)
MIKROTIK_IP=192.168.88.1
MIKROTIK_USER=admin
MIKROTIK_PASS=

# Flutterwave (Optional, can also be configured dynamically in Super Admin)
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_ENCRYPTION_KEY=
```

### 4. Database Setup (Supabase)
Run the complete SQL schema script located in [`scripts/schema.sql`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/wifi-app/scripts/schema.sql) inside your Supabase Dashboard **SQL Editor**. This creates:
- `app_settings` (dynamic router, branding, payment, login portal configs)
- `change_history` (audit trail with 1-click rollback)
- `pending_router_tasks` (asynchronous router task queuing)
- `fallback_vouchers` (offline continuity vouchers)

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🔒 Security Architecture
- **Admin Authentication**: All sensitive MikroTik router controls and Super Admin endpoints require HTTP Basic Auth or admin session tokens backed by Supabase `app_settings`.
- **Race Condition Protection**: Wallet deductions and credits utilize PostgreSQL atomic RPC functions (`adjust_wallet_balance`) with strict balance constraint checks.
- **Double-Credit Protection**: Payment webhook handlers and top-up verification enforce unique reference checks (`flw_ref`) to prevent replay attacks or simultaneous callback duplication.

---

## 🚢 Production Deployment (e.g. Vercel)

1. Import this repository into Vercel.
2. In Project Settings > **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy! Router settings and payment keys can be managed directly in `/super-admin`.
