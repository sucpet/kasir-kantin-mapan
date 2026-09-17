# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # start dev server at localhost:3000
npm run build        # production build
npm run lint         # ESLint

npm run test                        # run all Playwright tests (headless)
npm run test:ui                     # Playwright UI mode
npm run test:headed                 # run tests in headed browser
npx playwright test tests/order-page.spec.ts   # run a single test file
```

Tests require the dev server — Playwright starts it automatically via `webServer` config if not already running.

## Environment

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Architecture

### Two user surfaces

**Cashier (`/`)** — requires Supabase auth. The entire UI is rendered by `components/App.tsx`, which hosts a tab bar and conditionally mounts one tab at a time:

| Tab | File | Purpose |
|-----|------|---------|
| Kasir | `components/tabs/KasirTab.tsx` | Build cart, create orders, print receipt |
| Pesanan | `components/tabs/PesananTab.tsx` | View/settle today's orders |
| Menu | `components/tabs/MenuTab.tsx` | Manage menu items |
| Stok | `components/tabs/StokTab.tsx` | Manage per-item stock |
| Rekap | `components/tabs/RekapTab.tsx` | Daily/weekly sales recap |

**Customer self-order (`/order`)** — no Supabase auth. Uses phone-number lookup against the `customers` table and stores a 5-minute session in `sessionStorage` (`kantin_order_session`). Built entirely inside `app/order/page.tsx`.

### Order lifecycle

`open` → `paid` → `done`

- **open**: created by kasir (tab mode) or customer self-order
- **paid**: payment confirmed; order is cooking
- **done**: food served

Orders from customers carry `source: 'customer'`; kasir-created orders carry `source: 'kasir'`.

### Real-time

`App.tsx` and `PesananTab.tsx` each hold live Supabase channel subscriptions (`postgres_changes`) to update counts and order lists without polling. When a customer self-order arrives, `App.tsx` pops a new-order alert modal and redirects to the Pesanan tab.

### Data layer

All DB calls go through the singleton in `lib/supabase.ts` (browser-side `createBrowserClient`). There is no API route layer — components query Supabase directly.

Auth routing is handled by `proxy.ts` (Next.js middleware): unauthenticated users are redirected to `/login`; `/order` is always public.

### Printing

`lib/printer.ts` implements Web Bluetooth (BLE) thermal printer support via ESC/POS. It tries multiple known BLE service UUIDs in sequence. If no BLE printer is connected, printing falls back to `window.print()` via a hidden `#print-zone` element. Set `localStorage.printer_mock = 'true'` to simulate BLE print without hardware.

Auto-print on order creation is controlled by `localStorage.auto_print = 'true'`.

### Theming

CSS custom properties are defined in `app/globals.css`. Dark mode is the default; `html.light` class switches to light mode. The theme class is applied before first paint via an inline script in `app/layout.tsx` to prevent flash. Saved to `localStorage.theme`.

Always use CSS variables (e.g. `var(--color-primary)`) for colors — never raw hex values in component JSX.

### Points / loyalty

The `customers` table and points logic exist in the DB schema (`supabase/schema.sql`), including a server-side `create_order` RPC that validates and applies point redemption. The `orders` table has `pending_redeem` and `points_to_earn` columns used by the customer page. Schema changes must be applied manually in the Supabase SQL editor.

### Testing

Tests live in `tests/` and use fixtures from `tests/helpers/fixtures.ts`. Fixtures intercept Supabase REST and realtime requests via `page.route()` (no real DB calls in tests). `injectSession()` seeds `sessionStorage` to bypass the customer phone-login flow.
