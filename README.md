# StockHold — Inventory Reservation Platform

A race-condition-free inventory reservation system for multi-warehouse retail and D2C brands. Built with Next.js 14 App Router, Prisma + Supabase (Postgres), Upstash Redis, and TypeScript end-to-end.

## Live Demo

🔗 **https://stockhold-1hwr.vercel.app**

> The database is pre-seeded with 4 products across 2 warehouses. Try reserving the **Urban Runner Sneakers (NYC — 1 unit)** to see the race-condition protection in action.

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
git clone https://github.com/koushikpalakurthi/stockhold.git
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

> **Note:** If your database password contains special characters (e.g. `@`), URL-encode them in the connection string (`@` → `%40`).

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
- **Varied stock levels** — including Urban Runner Sneakers with **1 unit in NYC**, perfect for demonstrating the race condition protection

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
- Available stock is always accurate when someone views the product page
- No extra infrastructure needed
- Zero additional latency (runs in the same request)

### Layer 2: Vercel Cron (once daily at midnight UTC)
`vercel.json` schedules `GET /api/cron/cleanup` to run daily. This handles edge cases where no one is browsing (overnight quiet periods). The endpoint is protected by `CRON_SECRET`.

> **Note on frequency:** The Vercel Hobby plan limits cron jobs to once per day. In production (Pro plan), this would run every 5 minutes (`*/5 * * * *`). The lazy cleanup on page load compensates for this — expired reservations are always cleaned before stock counts are returned.

---

## Concurrency — How We Prevent Oversell

This is the core of the exercise. Two layers of protection:

### Layer 1: Redis Distributed Lock
When a reservation request comes in, we acquire a Redis lock keyed on `lock:reserve:{productId}:{warehouseId}` using `SET NX EX` (atomic, TTL-backed). This serializes concurrent writes for the same SKU — if two requests arrive simultaneously, one gets the lock and the other gets a 429 (retry).

### Layer 2: PostgreSQL `SELECT FOR UPDATE`
Inside a Prisma transaction, we run:

```sql
SELECT ... FROM "WarehouseStock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

This acquires a **row-level exclusive lock** on the stock row. The transaction then:
1. Checks `totalUnits - reservedUnits >= quantity` — returns 409 if not
2. Atomically increments `reservedUnits`
3. Creates the reservation row

**Critical property:** Even if Redis goes down and two requests reach the DB simultaneously, `SELECT FOR UPDATE` serializes them at the Postgres level — exactly one will succeed and the other will get a 409.

The Redis lock is an optimization (reduces DB lock contention on hot SKUs) but is **not** required for correctness. The DB transaction is the real safety net.

---

## Idempotency (Bonus)

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

**How it works:**
1. Client sends a unique UUID in the `Idempotency-Key` header
2. Server checks Redis for `idem:{key}` before processing
3. If found → return the stored `{status, body}` immediately, no side effects
4. If not found → process normally, store `{status, body}` in Redis with 24h TTL

**Why Redis and not Postgres?** TTL-based expiry is trivial in Redis (`SET NX EX`). In Postgres you'd need a cleanup job — Redis handles it automatically. The `X-Idempotent-Replayed: true` header is returned on cache hits so clients can distinguish original from replayed responses.

---

## Deploying to Vercel

### Prerequisites
- Supabase project with connection strings
- Upstash Redis database

### Steps

```bash
# 1. Push to GitHub
git push origin master

# 2. Import at vercel.com/new
# 3. Add environment variables in Vercel dashboard:
#    DATABASE_URL, DIRECT_URL, UPSTASH_REDIS_REST_URL,
#    UPSTASH_REDIS_REST_TOKEN, RESERVATION_WINDOW_MINUTES, CRON_SECRET

# 4. Deploy — Vercel runs postinstall (prisma generate) automatically
```

> **Important:** Prisma requires `"postinstall": "prisma generate"` in `package.json` so Vercel generates the client types after `npm install`. This is already included.

> **Important:** Supabase uses PgBouncer in transaction mode. Use the **pooled URL (port 6543)** for `DATABASE_URL` (runtime queries) and the **direct URL (port 5432)** for `DIRECT_URL` (migrations only).

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List all warehouses |
| `POST` | `/api/reservations` | Reserve units. 409 if insufficient stock, 429 on lock contention |
| `GET` | `/api/reservations/:id` | Get a single reservation (with product + warehouse details) |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. 410 if expired |
| `POST` | `/api/reservations/:id/release` | Release reservation early |
| `GET` | `/api/cron/cleanup` | Batch release expired reservations (called by Vercel Cron) |

---

## Trade-offs & What I'd Do Differently

### Trade-offs made

**Local `reservedUnits` counter vs. live aggregation**
I maintain a `reservedUnits` column that's incremented/decremented rather than computing `SUM(quantity) WHERE status=PENDING` on each read. This is faster for reads but means the counter can theoretically drift if a bug leaves a reservation without a corresponding stock update. I mitigate this by wrapping both operations in a single Prisma transaction.

**Lock-fail = 429, not a retry**
When Redis returns "lock held," I return 429 to the client rather than spinning. This keeps server-side logic simple and pushes retry responsibility to the client. In production I'd add a retry with jitter in the frontend.

**Client-side countdown**
The countdown is purely client-side, derived from `expiresAt`. If a server-side release happens mid-countdown (e.g. admin override), the UI won't immediately reflect it. For production I'd add a short polling interval to keep the checkout page in sync with server state.

**Daily cron on Hobby plan**
Vercel Hobby restricts cron jobs to once per day. The lazy cleanup on `GET /api/products` compensates in the common case. A Pro plan (or a free Vercel cron alternative like QStash) would allow every 5 minutes.

### What I'd add with more time

- Admin dashboard for reservation management and stock editing
- Per-IP rate limiting on the reserve endpoint to prevent abuse
- Email confirmations on reserve and confirm
- Conversion rate metrics (reserve → confirm funnel)
- Optimistic UI — pre-decrement stock display while reservation is in-flight
- Warehouse selection heuristics — auto-select cheapest-to-ship warehouse based on customer location

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript end-to-end |
| Database | Supabase (hosted Postgres) + Prisma ORM v7 |
| Distributed Lock | Upstash Redis |
| Validation | Zod |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Cron | Vercel Cron Jobs |
| Source | [github.com/koushikpalakurthi/stockhold](https://github.com/koushikpalakurthi/stockhold) |
