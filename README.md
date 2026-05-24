# StockHold — Inventory Reservation Platform

A race-condition-free inventory reservation system for multi-warehouse retail and D2C brands. Built with Next.js 14 App Router, Prisma + Supabase (Postgres), Upstash Redis, and TypeScript end-to-end.

## Live Demo

> Deploy to Vercel and add your URL here.

---

## What It Does

When a customer reaches checkout, we face a race condition: payment can take several minutes (3DS flows, UPI confirmations), and during that window, many other shoppers may want the same unit.

**StockHold solves this with a reservation system:**
1. Customer clicks "Reserve" → units are atomically held for 10 minutes
2. Payment proceeds — the hold prevents any other reservation of those units
3. On success → reservation is **confirmed**, stock permanently decremented
4. On failure/timeout → reservation is **released**, units return to available pool

---

## How to Run Locally

### 1. Clone and install

```bash
git clone <your-repo>
cd stockhold
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | [Supabase](https://supabase.com) → Project → Settings → Database → Transaction mode (port **6543**) |
| `DIRECT_URL` | [Supabase](https://supabase.com) → Project → Settings → Database → Session mode (port **5432**) |
| `UPSTASH_REDIS_REST_URL` | [Upstash](https://upstash.com) → Redis → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | [Upstash](https://upstash.com) → Redis → REST Token |
| `CRON_SECRET` | Any random string (e.g. `openssl rand -hex 32`) |

### 3. Run migrations

```bash
npx prisma migrate dev --name init
```

### 4. Seed the database

```bash
npm run db:seed
```

This creates:
- **2 warehouses**: NYC Fulfillment Center, LA Distribution Hub
- **4 products**: Classic Crew Tee, Essential Pullover Hoodie, Urban Runner Sneakers, Structured Baseball Cap
- **Varied stock levels**, including the Urban Runner Sneakers with **1 unit in NYC** — perfect for demonstrating the race condition protection

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Expiry Mechanism

The system uses a **belt-and-suspenders** approach:

### Layer 1: Lazy Cleanup (on every product list fetch)
Every call to `GET /api/products` triggers `releaseExpiredReservations()` before computing available stock. This means:
- Available stock is always fresh when someone views the product page
- No extra infrastructure needed
- Zero additional latency (runs in the same request)

### Layer 2: Vercel Cron (every 5 minutes)
`vercel.json` schedules `GET /api/cron/cleanup` to run every 5 minutes. This handles edge cases where no one is browsing (quiet periods, low-traffic windows). The endpoint is protected by `CRON_SECRET`.

**Why not a message queue?** This is a deliberate trade-off: cron + lazy cleanup is sufficient for correctness, requires zero extra infrastructure, and is easy to reason about. A message queue would be better for sub-minute precision at scale.

---

## Concurrency — How We Prevent Oversell

Two layers of protection:

### Layer 1: Redis Distributed Lock
When a reservation request comes in, we acquire a Redis lock keyed on `lock:reserve:{productId}:{warehouseId}` using `SET NX EX` (atomic, TTL-backed). This serializes concurrent writes for the same SKU.

### Layer 2: PostgreSQL SELECT FOR UPDATE
Inside a Prisma transaction, we run `SELECT ... FOR UPDATE` on the stock row, then check availability and atomically increment `reservedUnits`. Even if Redis goes down, the DB transaction is the real safety net.

---

## Idempotency (Bonus)

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

1. Client sends a unique key (UUID) in `Idempotency-Key` header
2. Server checks Redis for `idem:{key}` before processing
3. If found → return the stored response immediately (no side effects)
4. If not found → process normally, store response in Redis with 24h TTL

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List all warehouses |
| `POST` | `/api/reservations` | Reserve units. 409 if insufficient stock |
| `GET` | `/api/reservations/:id` | Get a single reservation |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. 410 if expired |
| `POST` | `/api/reservations/:id/release` | Release reservation early |
| `GET` | `/api/cron/cleanup` | Batch release expired reservations |

---

## Trade-offs

- **Lock-fail = 429**: When Redis returns "lock held," we return 429 rather than spinning. Simple server logic, retry responsibility pushed to client.
- **Client-side countdown**: Derived from `expiresAt`. No WebSockets — for production I'd add polling to keep the checkout page in sync with server state.
- **Cron precision**: Free tier runs every 5 minutes; lazy cleanup on page load compensates.

## What I'd Add With More Time

- Admin dashboard for reservation management
- Per-IP rate limiting on the reserve endpoint
- Email confirmations
- Conversion rate metrics (reserve → confirm funnel)
- Optimistic UI for stock decrement
