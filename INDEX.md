# Project Index: Asuk Tech WiFi Hotspot & Super Admin Platform

> **Comprehensive Technical Catalog, Directory Map, Architecture Specification, and API Reference**

---

## 1. Project Overview

The **Asuk Tech WiFi Platform** is a full-stack ISP / Wi-Fi Hotspot captive portal, prepaid digital wallet, and network administration platform designed for MikroTik RouterOS v7.x networks.

### Core Capabilities
1. **Public / Guest "Quick Buy"**: Frictionless flow where users select an internet plan, pay through Flutterwave checkout, and receive an instant MikroTik voucher code without requiring prior account registration.
2. **Member Portal & Digital Wallet**: Authenticated user dashboard with an in-app prepaid wallet, one-click voucher generation deducted from balance, top-ups via Flutterwave, transaction ledger, and voucher history.
3. **MikroTik RouterOS v7 REST Integration**: Server-side engine communicating directly with MikroTik RouterOS v7 REST endpoints (`PUT`, `GET`, `DELETE`, `PATCH`) with HTTP Basic Auth and SSL bypass support.
4. **Super Admin Suite (`/super-admin`)**: Full-featured back-office control center for network operators featuring real-time router health, active session monitoring, user kicking, bulk voucher manufacturing, financial analytics (PDF/Excel exports), dynamic credential synchronization, and database migration tooling.

---

## 2. Workspace File Structure

```
Asuk Tech/
├── prompt.txt                         # Original project requirements & architecture specification
├── sample.html                        # Prototype single-file mobile captive portal & wallet mock-up
├── screenshot 1.jpeg                  # Visual UI design reference 1
├── screenshot 2.jpeg                  # Visual UI design reference 2
├── supabase access tokens.txt         # Supabase CLI / deployment access token
├── INDEX.md                           # This comprehensive project index & catalog
└── wifi-app/                          # Full-Stack Next.js 16 Web Application
    ├── package.json                   # App manifest & dependencies (Next 16, React 19, Supabase, jsPDF, xlsx)
    ├── package-lock.json              # Dependency lockfile
    ├── README.md                      # Deployment & setup documentation
    ├── AGENTS.md                      # Next.js agent operational rules
    ├── next.config.mjs                # Next.js runtime configuration
    ├── jsconfig.json                  # Path aliases configuration (@/* -> ./*)
    ├── vercel.json                    # Vercel deployment configuration
    ├── .env.example                   # Template environment variables
    ├── .env.local                     # Local environment configuration
    │
    ├── app/                           # Next.js App Router root
    │   ├── layout.js                  # Global application layout, metadata & context providers
    │   ├── globals.css                # Master CSS design system (Telecom yellow & clean light palette)
    │   ├── page.js                    # Homepage (Hero balance, promo banner, plan cards, quick actions)
    │   ├── manifest.js                # PWA web app manifest
    │   │
    │   ├── admin/                     # Admin landing / redirect
    │   │   └── page.js
    │   │
    │   ├── analytics/                 # Usage & network traffic analytics
    │   │   └── page.js
    │   │
    │   ├── auth/                      # User authentication (Login & Registration)
    │   │   ├── page.js                # Auth form with Supabase session management
    │   │   └── reset-password/
    │   │       └── page.js            # Password recovery flow
    │   │
    │   ├── login/                     # Captive portal router login page
    │   │   └── page.js                # Responsive hotspot voucher login interface
    │   │
    │   ├── packages/                  # Plan catalog view
    │   │   └── page.js                # Browsable list of all active hotspot packages
    │   │
    │   ├── status/                    # User connection status
    │   │   └── page.js                # Live connection & IP status
    │   │
    │   ├── super-admin/               # Super Admin Control Center
    │   │   └── page.js                # Comprehensive multi-tab operator dashboard (287 KB)
    │   │
    │   ├── vouchers/                  # User vouchers & voucher status
    │   │   ├── page.js                # User voucher library & printable vouchers
    │   │   └── status/
    │   │       └── page.js            # Voucher validity & active uptime checker
    │   │
    │   ├── wallet/                    # User prepaid wallet
    │   │   └── page.js                # Wallet balance, top-up modal, and transaction ledger
    │   │
    │   ├── components/                # Reusable UI Components
    │   │   ├── BottomNav.js           # Floating/raised mobile bottom navigation bar
    │   │   ├── CheckoutModal.js       # Multi-step checkout modal (Flutterwave & Wallet)
    │   │   ├── SideDrawer.js          # Slide-out navigation drawer with user links
    │   │   ├── VoucherModal.js        # Voucher code display with 1-click copy & login link
    │   │   ├── ReceiptModal.js        # Transaction receipt display & PDF download modal
    │   │   ├── DatabaseSchemaTab.js   # SQL schema viewer & turnkey setup assistant
    │   │   ├── MikroTikDiagnosticsAndLogs.js # Live router diagnostics & system logs panel
    │   │   ├── MikroTikSetupGuide.js  # Interactive visual setup guide for MikroTik v7 REST API
    │   │   ├── WindowsProgressBar.js  # Windows-themed animated progress indicator
    │   │   └── Icons.js               # Comprehensive Lucide-style SVG icon system
    │   │
    │   ├── context/                   # Global State & Context Providers
    │   │   ├── AuthContext.js         # Supabase auth session, user role, and wallet balance provider
    │   │   └── BrandingContext.js     # Dynamic ISP branding, colors, logos, and support info provider
    │   │
    │   └── api/                       # Backend API Route Handlers
    │       ├── admin/
    │       │   └── stats/route.js     # Operator revenue & sales statistics
    │       │
    │       ├── mikrotik/              # MikroTik RouterOS v7 REST Integration
    │       │   ├── active-sessions/   # GET active sessions & user uptime/bytes
    │       │   ├── auto-setup/        # POST automated router configuration
    │       │   ├── create-voucher/    # PUT generate single voucher on router
    │       │   ├── generate-vouchers/ # POST batch voucher manufacturing
    │       │   ├── hotspot-profiles/  # GET/POST router user profiles
    │       │   ├── hotspot-users/     # GET/PATCH router hotspot user records
    │       │   ├── kick-user/         # DELETE terminate active hotspot session
    │       │   ├── logs/              # GET router system event logs
    │       │   ├── polling/           # POST execute pending asynchronous router tasks
    │       │   ├── push-login-page/   # POST upload custom HTML captive portal to router
    │       │   ├── reboot/            # POST trigger router system reboot
    │       │   ├── restore-defaults/  # POST safe restore default hotspot & factory login page
    │       │   ├── sync-hotspot/      # POST bidirectional sync between router and DB
    │       │   ├── system-health/     # GET CPU load, memory, uptime, version
    │       │   ├── test/              # GET router diagnostic test
    │       │   ├── test-connection/   # POST verify router IP and credentials
    │       │   └── walled-garden/     # GET/POST manage bypass domains for payments
    │       │
    │       ├── notifications/         # GET/PATCH user notifications
    │       │   └── route.js
    │       │
    │       ├── purchase/              # Voucher purchasing pipeline
    │       │   ├── route.js           # POST initiate purchase or execute wallet purchase
    │       │   └── verify-payment/    # POST verify Flutterwave transaction and issue voucher
    │       │
    │       ├── settings/              # Public runtime configuration
    │       │   └── public/            # GET branding, support contacts, and public keys
    │       │
    │       ├── super-admin/           # Super Admin back-office API
    │       │   ├── auth/              # POST admin authentication & session tokens
    │       │   ├── change-history/    # GET/POST configuration audit trail & rollback
    │       │   ├── fallback-vouchers/ # GET/POST offline emergency voucher pool
    │       │   ├── finance/           # GET financial analytics & export data
    │       │   ├── plans/             # GET/POST/PUT/DELETE hotspot internet plans
    │       │   ├── schema/            # GET/POST database schema check & migrations
    │       │   └── settings/          # GET/POST dynamic settings (MikroTik, Flutterwave, Branding)
    │       │
    │       ├── vouchers/              # Voucher inspection & validation
    │       │   ├── status/            # GET/POST check voucher uptime & remaining quota
    │       │   └── validate/          # POST validate voucher before login
    │       │
    │       ├── wallet/                # Digital wallet operations
    │       │   └── topup/             # POST initialize or verify wallet funding via Flutterwave
    │       │
    │       └── webhook/               # Payment gateway webhooks
    │           └── flutterwave/       # POST async payment verification webhook
    │
    ├── lib/                           # Core Utilities & Business Logic
    │   ├── mikrotik.js                # Robust MikroTik RouterOS v7 REST client (SSL bypass, PUT/GET/DELETE/PATCH)
    │   ├── supabase.js                # Browser Supabase client initialization
    │   ├── supabase-server.js         # Privileged service_role Supabase server client
    │   ├── user-auth.js               # Client session & JWT extraction helper
    │   ├── admin-auth.js              # Admin session verification & permission checks
    │   ├── changeHistory.js           # Configuration audit logging & 1-click snapshot rollback
    │   ├── hotspotTemplates.js        # MikroTik captive portal HTML/CSS template engine
    │   ├── receiptGenerator.js        # PDF & visual receipt generation for transactions
    │   ├── voucherCardGenerator.js    # Printable voucher sheet & thermal slip layout builder
    │   └── voucher-utils.js           # Alphanumeric voucher generation & formatting routines
    │
    ├── scripts/                       # Database DDL & Automation Scripts
    │   ├── schema.sql                 # Complete Supabase turnkey SQL schema (Tables, RLS, RPCs, Triggers)
    │   └── migrate-polling.mjs        # Script to initialize polling tables & tasks
    │
    └── public/                        # Static assets (Favicons, logos, icons)
```

---

## 3. Technology Stack & Key Dependencies

| Layer | Technologies |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19 |
| **Styling** | Custom Vanilla CSS Design System with CSS Custom Properties, Glassmorphism, Responsive Mobile-First Grid |
| **Database & Auth** | Supabase (PostgreSQL 15+, Row Level Security, Atomic Pl/pgSQL Functions) |
| **Hardware REST API** | MikroTik RouterOS v7.x REST API (`https://<ROUTER_IP>/rest/...`) |
| **Payment Gateway** | Flutterwave v3 (Standard Checkout Modal & Webhook Integration) |
| **Document Generation** | `jspdf` (v4.2.1), `jspdf-autotable` (v5.0.8), `xlsx` (v0.18.5) |

---

## 4. Database Schema Catalog (`scripts/schema.sql`)

### Tables
1. **`public.profiles`**: Extended user profile linked 1-to-1 with `auth.users(id)`. Stores phone, full_name, role (`customer` | `admin`), and creation timestamp.
2. **`public.wallets`**: Customer prepaid balance ledger. Enforces `CHECK (balance >= 0)`.
3. **`public.transactions`**: Financial transaction audit log. Tracks type (`wallet_topup`, `quick_buy`, `voucher_purchase`), amount, Flutterwave reference (`flw_ref`), status (`pending`, `successful`, `failed`), and metadata.
4. **`public.vouchers`**: Generated Wi-Fi hotspot vouchers. Contains voucher_code, profile_name, price, duration, data_limit, status (`active`, `used`, `expired`), batch_id, and optional link to `transactions(id)`.
5. **`public.plans`**: Configurable hotspot internet packages (e.g., 1 Hour, 24 Hours, 7 Days) with bandwidth limits (upload/download speed) and pricing.
6. **`public.notifications`**: In-app notifications delivered to customer dashboards.
7. **`public.app_settings`**: Key-value JSONB store for dynamic configuration:
   - `mikrotik`: IP, REST port, username, password, profile defaults.
   - `flutterwave`: Public Key, Secret Key, Encryption Key, enabled toggle.
   - `branding`: ISP title, logo URL, currency, support phone/email.
   - `login_portal`: Captive portal HTML/CSS customization.
8. **`public.change_history`**: Audit trail recording before/after configuration state snapshots for 1-click rollback.
9. **`public.pending_router_tasks`**: Asynchronous task queue for router provisioning when router is temporarily unreachable.
10. **`public.fallback_vouchers`**: Pre-generated offline voucher cache ensuring service continuity during network interruptions.

### Stored Procedures & Atomic Functions
- **`public.adjust_wallet_balance(p_user_id, p_amount, p_operation)`**: Atomic debit/credit function preventing balance race conditions and negative balances.
- **`public.handle_new_user()`**: Trigger function executed upon `auth.users` creation to initialize profile and wallet entries automatically.

---

## 5. MikroTik RouterOS v7 REST API Implementation

The integration adheres strictly to RouterOS v7 ECMA-404 REST API conventions:
- **Protocol & Auth**: HTTPS with HTTP Basic Authentication (`Authorization: Basic <base64>`).
- **SSL Bypass**: Employs an HTTPS agent with `rejectUnauthorized: false` to allow self-signed certificates.
- **String Types**: Converts all numbers, booleans, and parameters to string representations as required by RouterOS JSON parser.

### Key REST Methods
- **Create Hotspot User**: `PUT /rest/ip/hotspot/user`
- **Read Active Sessions**: `GET /rest/ip/hotspot/active` or `POST /rest/ip/hotspot/active/print`
- **Disconnect / Kick User**: `DELETE /rest/ip/hotspot/active/{.id}`
- **Update Hotspot User**: `PATCH /rest/ip/hotspot/user/{.id}`
- **System Health & Resources**: `GET /rest/system/resource`
- **System Reboot**: `POST /rest/system/reboot`
- **System Logs**: `GET /rest/log`
- **Walled Garden Entries**: `PUT /rest/ip/hotspot/walled-garden`

---

## 6. Payment Flow Architecture

### Flow 1: Guest "Quick Buy"
1. Guest navigates to `/` and taps a plan.
2. Inputs email or phone number in [`CheckoutModal.js`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/wifi-app/app/components/CheckoutModal.js).
3. Opens Flutterwave Inline Checkout.
4. On authorization, payment is verified via [`/api/purchase/verify-payment`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/wifi-app/app/api/purchase/verify-payment).
5. Router user is provisioned via `lib/mikrotik.js`.
6. Voucher is saved to `public.vouchers` and displayed on-screen with 1-click copy and auto-connect buttons.

### Flow 2: Authenticated Member Wallet
1. User authenticates via `/auth` and visits `/wallet`.
2. Taps **"+ Top Up"** to fund wallet via Flutterwave.
3. Upon verified transaction, `adjust_wallet_balance` credits the wallet.
4. User selects any plan and clicks **"Pay with Wallet"**.
5. Server verifies balance, atomically deducts amount, provisions MikroTik voucher, and delivers voucher to user's library.

---

## 7. Environment Variables Index (`.env.local`)

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Public Anonymous API Key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Privileged Service Role Key | Yes |
| `NEXT_PUBLIC_APP_URL` | Canonical Production Web URL | Optional |
| `MIKROTIK_IP` | MikroTik Router IP address | Optional (Can configure in Super Admin) |
| `MIKROTIK_USER` | Router admin username | Optional (Can configure in Super Admin) |
| `MIKROTIK_PASS` | Router admin password | Optional (Can configure in Super Admin) |
| `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave Public API Key | Optional (Can configure in Super Admin) |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave Secret API Key | Optional (Can configure in Super Admin) |
| `FLUTTERWAVE_ENCRYPTION_KEY` | Flutterwave Webhook Encryption Key | Optional (Can configure in Super Admin) |

---

## 8. Root Workspace Assets

- [`prompt.txt`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/prompt.txt): Full engineering requirements document defining the three core areas, design rules, REST endpoints, and deliverables.
- [`sample.html`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/sample.html): Standalone HTML/CSS reference showcasing the mobile fintech look, color tokens, and layout.
- [`screenshot 1.jpeg`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/screenshot%201.jpeg) & [`screenshot 2.jpeg`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/screenshot%202.jpeg): Visual reference mockups.
- [`supabase access tokens.txt`](file:///c:/Users/DEEPMIND/Desktop/Asuk%20Tech/supabase%20access%20tokens.txt): Personal access token for Supabase CLI operations.
