# Engineering Inventory Management System

A multi-hotel inventory system for the Engineering department, built to expand to
other departments (Housekeeping, Guest Services, Food & Beverage) later without
a schema rewrite — `Department` is a first-class dimension on every record.

## Stack

- `/server` — Node.js + TypeScript + Express + Prisma ORM + PostgreSQL
- `/client` — React + TypeScript + Vite + Tailwind CSS + TanStack Query

## Features (v1)

- Stock inventory per hotel with quantities, reorder points, and low-stock alerts
- Stock in/out/adjustment transaction logging (full audit trail)
- Purchase request workflow: request → approve/reject → receive
- Work orders, with stock transactions linkable to a work order
- Roles: Admin (all hotels), Manager (their hotel), Staff (day-to-day stock actions)

## Running locally (free — no cloud account needed)

### 1. Start PostgreSQL

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```
docker compose up -d
```

This starts a local Postgres instance (user/pass/db: `inventory`/`inventory`/`inventory`).

### 2. Configure environment variables

```
cp server/.env.example server/.env
cp client/.env.example client/.env
```

The defaults already match the `docker-compose.yml` database, so no edits are
needed for local development. Set a real `JWT_SECRET` in `server/.env` before
this ever runs anywhere other than your own machine.

### 3. Install dependencies

From the repo root (uses npm workspaces):

```
npm install
```

### 4. Create the database schema and seed data

```
npm run db:migrate
npm run db:seed
```

The seed script creates:
- 7 hotels (`Hotel 1`..`Hotel 7` — rename them under Admin → Hotels)
- The `Engineering` department (plus `Housekeeping`, `Guest Services`,
  `Food & Beverage` reserved for later rollout)
- Starter categories (HVAC, Plumbing, Electrical, General Maintenance, Safety & PPE)
- One Admin login, printed to the console when the seed finishes
  (default: `admin@example.com` / `ChangeMe123!` — change this password after first login)

### 5. Run the app

In two terminals:

```
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # Web app on http://localhost:5173
```

Open http://localhost:5173 and log in with the seeded Admin account.

## Adding a new department later

1. The department already exists in the `Department` table (seeded but unused).
2. Add categories for it via the Admin → Categories screen (select the new department).
3. Create Manager/Staff users scoped to that department.
4. The Inventory, Purchase Requests, and Work Orders screens work unchanged —
   they're scoped by hotel + department already.

## Deploying live, for free

This stack (Neon + Render + Vercel) is genuinely free — no credit card required
on any of the three. The tradeoff: Render's free web service spins down after
15 minutes of no traffic, so the first request after a quiet period takes
20–50 seconds to wake back up. Everything after that is normal speed.

Do these in order — each step needs a value produced by the one before it.

### 1. Database — Neon

1. Go to [neon.tech](https://neon.tech) and sign up (GitHub sign-in is fastest).
2. Create a project. Copy the connection string it gives you (starts with
   `postgresql://...`) — this is your `DATABASE_URL`.

### 2. Backend API — Render

1. Go to [render.com](https://render.com) and sign up with GitHub.
2. **New → Blueprint**, pick the `engineering-inventory-system` repo. Render
   reads `render.yaml` from the repo root and sets up the web service
   automatically — you just need to fill in the secret values it asks for:
   - `DATABASE_URL` — the Neon connection string from step 1
   - `JWT_SECRET` — any long random string, e.g. generate one locally with
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
     — use a fresh value here, not your local dev secret
   - `CLIENT_ORIGIN` — leave as `http://localhost:5173` for now; you'll update
     this in step 4 once the frontend has a real URL
3. Deploy. When it finishes, copy the service URL Render gives you (something
   like `https://engineering-inventory-api.onrender.com`) — this is your
   `VITE_API_URL` for the next step.
4. The build command in `render.yaml` runs the database migration
   (`prisma migrate deploy`) and seeds nothing automatically — run
   `npm run db:seed` once yourself pointed at the Neon database (set
   `DATABASE_URL` in `server/.env` locally to the Neon connection string
   temporarily, run `npm run db:seed` from the repo root, then put your real
   local `DATABASE_URL` back) to get the starter hotels/categories/admin login.

### 3. Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub.
2. **Add New → Project**, import the same repo.
3. Set **Root Directory** to `client`. Vercel auto-detects Vite.
4. Add an environment variable: `VITE_API_URL` = the Render URL from step 2.
5. Deploy. Copy the URL Vercel gives you (something like
   `https://engineering-inventory.vercel.app`).

### 4. Close the loop

Go back to Render → your service → Environment, and set `CLIENT_ORIGIN` to the
Vercel URL from step 3 (no trailing slash). Save — Render redeploys
automatically. Now the API only accepts requests from your live frontend.

### If you outgrow the free tier

At real usage, the first upgrade worth paying for is usually Render's ~$7/mo
starter plan, which removes the sleep-on-idle behavior. Neon and Vercel's free
tiers comfortably handle a small team's traffic for a long time before that
becomes the bottleneck.
