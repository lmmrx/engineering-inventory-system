# Property Inventory Management System

A multi-hotel, multi-department inventory system. Every hotel has four live
departments — Engineering, Housekeeping, Guest Services, and Food & Beverage —
each with its own categories, inventory, purchase requests, and work orders.
`Department` and `Hotel` are both first-class dimensions on every record, so
adding a fifth department later is a data change, not a schema change.

## Stack

- `/server` — Node.js + TypeScript + Express + Prisma ORM + PostgreSQL
- `/client` — React + TypeScript + Vite + Tailwind CSS + TanStack Query

## Features (v1)

- Stock inventory per hotel *and* department, with quantities, reorder points, and low-stock alerts
- Stock in/out/adjustment transaction logging (full audit trail)
- Purchase request workflow: request → approve/reject → receive
- Work orders, with stock transactions linkable to a work order
- Admins switch between hotels ("Property") and departments from the account menu;
  Managers/Staff are pinned to their own hotel and department
- Roles: Admin (everything), Manager (their hotel + department), Staff (day-to-day stock actions)

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
- 7 hotels
- All 4 departments — Engineering, Housekeeping, Guest Services, Food & Beverage —
  each with a starter set of categories
- One Admin login, printed to the console when the seed finishes
  (default: `admin@example.com` / `ChangeMe123!` — change this password after first login)

### 5. Run the app

In two terminals:

```
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # Web app on http://localhost:5173
```

Open http://localhost:5173 and log in with the seeded Admin account.

## Switching hotels and departments

Only Admins can switch — everyone else is pinned to their own hotel and
department. From the account menu (the avatar, top right):

- **Property** — pick a specific hotel, or **All Hotels** to see inventory,
  purchase requests, and work orders combined across every property.
- **Department** — pick which department's data to view/manage. There's no
  "All Departments" mode, since a Housekeeping linen count and an Engineering
  HVAC filter count aren't meaningful mixed together — always exactly one
  department at a time.

## Adding a fifth department later

1. Add a row to the `Department` table (a migration, or directly).
2. Add categories for it via Settings → Categories (switch to that department
   first via the account menu, then add categories).
3. Create Manager/Staff users scoped to that department.
4. Everything else — Inventory, Purchase Requests, Work Orders, exports — works
   unchanged, since every one of those is scoped by hotel + department already.

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
